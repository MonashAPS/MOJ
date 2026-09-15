import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { writeBetterAuthRows } from "./auth/betterauth.ts";
import { buildAuthRows } from "./auth/build.ts";
import { parseSecretKeyFile } from "./auth/fernet.ts";
import { ImportContext } from "./context.ts";
import { loadEnvFiles } from "./env.ts";
import { extract } from "./extract.ts";
import { ConvexLoader, DryRunLoader, type Loader } from "./loader.ts";
import { readState, runPipeline, type StateFile, writeState } from "./pipeline.ts";
import { renderReport, reportToJson } from "./report.ts";
import { STEP_TABLES } from "./steps/index.ts";

interface Options {
  dump: string;
  secretKeyFile?: string;
  tables?: Set<string>;
  dryRun: boolean;
  out: string;
  report: boolean;
  resume: boolean;
  clear: boolean;
  forceExtract: boolean;
  fresh: boolean;
  skipAuth: boolean;
  skipConvex: boolean;
}

const USAGE = `Usage: npm run import -w tools/import -- --dump <file> [options]

  --dump <file>              mysqldump output, plain .sql or .sql.gz (required)
  --secret-key-file <file>   file holding SECRET_KEY=<django secret key>
  --tables a,b               only import these Convex tables
  --dry-run                  transform and write JSONL, do not touch Convex or Postgres
  --out <dir>                output directory (default tools/import/out)
  --report                   print the long report, including unmapped columns
  --resume                   skip tables already recorded as finished in <out>/state.json
  --clear                    clear each Convex table before inserting into it
  --force-extract            re-parse the dump even if <out>/raw looks current
  --fresh                    forget <out>/state.json and treat every table as unloaded
  --skip-auth                do not write the Better Auth tables
  --skip-convex              only write the Better Auth tables
  --help                     this message
`;

function parseArgs(argv: string[]): Options {
  const here = path.dirname(fileURLToPath(import.meta.url));

  const options: Options = {
    dump: "",
    dryRun: false,
    out: path.resolve(here, "..", "out"),
    report: false,
    resume: false,
    clear: false,
    forceExtract: false,
    fresh: false,
    skipAuth: false,
    skipConvex: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";

    const next = () => {
      const value = argv[++i];

      if (value === undefined) throw new Error(`${arg} needs a value`);

      return value;
    };

    switch (arg) {
      case "--dump":
        options.dump = next();
        break;
      case "--secret-key-file":
        options.secretKeyFile = next();
        break;
      case "--tables":
        options.tables = new Set(
          next()
            .split(",")
            .map((table) => table.trim())
            .filter((table) => table !== ""),
        );
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--out":
        options.out = path.resolve(next());
        break;
      case "--report":
        options.report = true;
        break;
      case "--resume":
        options.resume = true;
        break;
      case "--clear":
        options.clear = true;
        break;
      case "--force-extract":
        options.forceExtract = true;
        break;
      case "--fresh":
        options.fresh = true;
        break;
      case "--skip-auth":
        options.skipAuth = true;
        break;
      case "--skip-convex":
        options.skipConvex = true;
        break;
      case "--help":
      case "-h":
        process.stdout.write(USAGE);
        process.exit(0);
        break;
      default:
        throw new Error(`unknown argument ${arg}`);
    }
  }

  if (options.dump === "") throw new Error("--dump is required");

  if (options.tables) {
    const unknown = [...options.tables].filter((table) => !STEP_TABLES.includes(table));

    if (unknown.length > 0) {
      throw new Error(
        `--tables lists tables the importer does not fill: ${unknown.join(", ")}\nknown tables: ${STEP_TABLES.join(", ")}`,
      );
    }
  }

  return options;
}

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const env = loadEnvFiles(process.cwd());

  log(`reading ${options.dump}`);

  const manifest = await extract({
    dumpPath: options.dump,
    outDir: options.out,
    force: options.forceExtract,
  });

  const totalRows = Object.values(manifest.tables).reduce((sum, table) => sum + table.rows, 0);
  log(`${Object.keys(manifest.tables).length} tables, ${totalRows} rows in the dump`);

  let loader: Loader;

  if (options.dryRun) {
    loader = new DryRunLoader(path.join(options.out, "docs"));
  } else {
    const url = env.CONVEX_SELF_HOSTED_URL;
    const adminKey = env.CONVEX_SELF_HOSTED_ADMIN_KEY;

    if (!url || !adminKey) {
      throw new Error(
        "CONVEX_SELF_HOSTED_URL and CONVEX_SELF_HOSTED_ADMIN_KEY must be set (see .env.local), or pass --dry-run",
      );
    }

    loader = ConvexLoader.fromAdminKey(url, adminKey);
  }

  const ctx = new ImportContext(manifest, loader, {
    outDir: options.out,
    dryRun: options.dryRun,
    tables: options.tables,
    clear: options.clear,
  });

  // The state file is always carried forward, whether or not this run resumes,
  // so that a later --resume knows which tables are already in the deployment.
  // --resume decides whether finished tables are skipped, --fresh forgets them.
  const previous = options.fresh ? null : await readState(options.out);
  const mode = options.dryRun ? "dry-run" : "load";

  if (previous && options.resume && previous.mode !== mode) {
    throw new Error(
      `--resume found a ${previous.mode} state file in ${options.out}; start a fresh run or use a different --out`,
    );
  }

  const carried =
    previous && previous.mode === mode && previous.dump === manifest.dump.path ? previous : null;

  if (previous && !carried) {
    log(`ignoring the state file in ${options.out}: it is for a different dump or mode`);
  }

  const state: StateFile = carried ?? {
    mode,
    dump: manifest.dump.path,
    startedAt: new Date().toISOString(),
    finished: {},
  };

  if (!options.skipConvex) {
    await runPipeline(ctx, state, { resume: options.resume, log });
  } else {
    log("skipping Convex tables");
  }

  if (!options.skipAuth) {
    let djangoSecretKey: string | undefined;

    if (options.secretKeyFile) {
      djangoSecretKey = parseSecretKeyFile(await readFile(options.secretKeyFile, "utf8")).secretKey;
    }

    const authSecret = env.AUTH_SECRET ?? env.BETTER_AUTH_SECRET;
    const rows = await buildAuthRows(ctx, { djangoSecretKey, authSecret });

    const summary =
      `better auth: ${rows.stats.users} users, ${rows.stats.accounts} credential accounts, ` +
      `${rows.stats.twoFactors} two factor rows, ${rows.stats.passkeys} passkeys, ` +
      `${rows.stats.rewrittenEmails} rewritten emails`;

    log(summary);
    ctx.report.note(summary);

    if (options.dryRun) {
      log("dry run, not writing to Postgres");
    } else {
      const databaseUrl = env.DATABASE_URL;

      if (!databaseUrl) throw new Error("DATABASE_URL must be set to write the Better Auth tables");
      const { Client } = await import("pg");
      const client = new Client({ connectionString: databaseUrl });
      await client.connect();

      try {
        const result = await writeBetterAuthRows(client, rows);
        log(
          `postgres: wrote ${result.users} user, ${result.accounts} account, ` +
            `${result.twoFactors} twoFactor and ${result.passkeys} passkey rows`,
        );

        if (result.droppedColumns.length > 0) {
          log(`postgres: columns missing from the schema, not written: ${result.droppedColumns.join(", ")}`);
        }
      } finally {
        await client.end();
      }
    }

    state.finished.betterAuth = { docs: rows.stats.users, at: new Date().toISOString() };
    await writeState(options.out, state);
  }

  await ctx.closeEmitters();

  const json = reportToJson(ctx);
  await mkdir(options.out, { recursive: true });
  await writeFile(path.join(options.out, "report.json"), `${JSON.stringify(json, null, 2)}\n`);
  process.stdout.write(renderReport(json, options.report));
  log(`report written to ${path.join(options.out, "report.json")}`);
}

main().catch((cause: unknown) => {
  const trace = cause instanceof Error ? cause.stack : undefined;
  process.stderr.write(`${trace ?? String(cause)}\n`);
  process.exit(1);
});
