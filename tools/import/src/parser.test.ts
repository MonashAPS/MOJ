import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseCreateTable, parseInsert, readDump } from "./parser/dump.ts";
import { StatementSplitter } from "./parser/statements.ts";
import { readTuples } from "./parser/values.ts";

// Every fixture below is written by hand. Nothing here comes from a real dump.
const CREATE = [
  "CREATE TABLE `widget` (",
  "  `id` int(11) NOT NULL AUTO_INCREMENT,",
  "  `name` varchar(20) NOT NULL,",
  "  `body` longtext DEFAULT NULL,",
  "  `flag` tinyint(1) NOT NULL,",
  "  `ratio` double DEFAULT NULL,",
  "  `made` datetime(6) DEFAULT NULL,",
  "  `secret` longblob DEFAULT NULL,",
  "  PRIMARY KEY (`id`),",
  "  KEY `widget_name` (`name`),",
  "  CONSTRAINT `widget_fk` FOREIGN KEY (`id`) REFERENCES `other` (`id`)",
  ") ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=latin1;",
].join("\n");

function tupleValues(statement: string) {
  const insert = parseInsert(statement);

  if (!insert) throw new Error("not an insert");

  return [...readTuples(statement, insert.at)];
}

describe("parseCreateTable", () => {
  it("reads column names and types in order", () => {
    const table = parseCreateTable(CREATE);
    expect(table?.name).toBe("widget");
    expect(table?.columns.map((c) => c.name)).toEqual([
      "id",
      "name",
      "body",
      "flag",
      "ratio",
      "made",
      "secret",
    ]);
    expect(table?.columns.map((c) => c.type)).toEqual([
      "int(11)",
      "varchar(20)",
      "longtext",
      "tinyint(1)",
      "double",
      "datetime(6)",
      "longblob",
    ]);
  });

  it("ignores keys and constraints", () => {
    const table = parseCreateTable(CREATE);
    expect(table?.columns.some((c) => c.name.includes("PRIMARY"))).toBe(false);
  });
});

describe("value parsing", () => {
  it("handles quotes, escapes and NULL", () => {
    const stmt =
      "INSERT INTO `widget` VALUES " +
      "(1,'it\\'s','a\\nb\\r\\nc\\td\\\\e\\\"f\\Z\\0g',1,-1.5e-3,'2024-01-02 03:04:05.500000',0x4142),";

    const rows = tupleValues(`${stmt}(2,'','',0,NULL,NULL,NULL);`);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual([
      1,
      "it's",
      'a\nb\r\nc\td\\e"f\0g',
      1,
      -0.0015,
      "2024-01-02 03:04:05.500000",
      { $hex: "4142" },
    ]);
    expect(rows[1]).toEqual([2, "", "", 0, null, null, null]);
  });

  it("handles doubled quotes, commas, parentheses and semicolons inside strings", () => {
    const rows = tupleValues("INSERT INTO `widget` VALUES (1,'a''b','x),(y; z''',0,NULL,NULL,NULL);");
    expect(rows[0]?.[1]).toBe("a'b");
    expect(rows[0]?.[2]).toBe("x),(y; z'");
  });

  it("keeps the backslash for \\% and \\_ the way MySQL does", () => {
    const rows = tupleValues("INSERT INTO `widget` VALUES (1,'\\%\\_\\q',NULL,0,NULL,NULL,NULL);");
    expect(rows[0]?.[1]).toBe("\\%\\_q");
  });

  it("reads hex blobs, uppercase hex and binary literals", () => {
    const rows = tupleValues(
      "INSERT INTO `widget` VALUES (1,'a',NULL,0,NULL,NULL,0XdeadBEEF),(2,'b',NULL,0,NULL,NULL,x'0a0B'),(3,'c',NULL,0,NULL,NULL,_binary 'AB');",
    );

    expect(rows[0]?.[6]).toEqual({ $hex: "deadbeef" });
    expect(rows[1]?.[6]).toEqual({ $hex: "0a0b" });
    expect(rows[2]?.[6]).toEqual({ $hex: "4142" });
  });

  it("reads many rows from one multi row insert", () => {
    const tuples = Array.from({ length: 500 }, (_, i) => `(${i},'n${i}',NULL,0,NULL,NULL,NULL)`).join(",");
    const rows = tupleValues(`INSERT INTO \`widget\` VALUES ${tuples};`);
    expect(rows).toHaveLength(500);
    expect(rows[499]?.[1]).toBe("n499");
  });
});

describe("StatementSplitter", () => {
  const script = [
    "-- a comment with a semicolon; and an apostrophe: don't stop",
    "/*!40101 SET NAMES utf8mb4 */;",
    "/* block ; comment 'quoted' */",
    "DROP TABLE IF EXISTS `wid;get`;",
    CREATE,
    "INSERT INTO `widget` VALUES (1,'semi;colon','line\\nbreak',1,NULL,NULL,NULL);",
    "INSERT INTO `widget` VALUES (2,'trailing\\\\',NULL,0,NULL,NULL,NULL);",
  ].join("\n");

  it("splits statements the same way whatever the chunk size", () => {
    const whole = new StatementSplitter();
    const expected = [...whole.push(script), ...whole.end()];
    expect(expected.filter((s) => s.startsWith("INSERT"))).toHaveLength(2);

    for (const size of [1, 3, 7, 64, 1024]) {
      const splitter = new StatementSplitter();
      const out: string[] = [];

      for (let i = 0; i < script.length; i += size) out.push(...splitter.push(script.slice(i, i + size)));
      out.push(...splitter.end());
      expect(out, `chunk size ${size}`).toEqual(expected);
    }
  });

  it("does not cut a statement on a semicolon inside a string", () => {
    const splitter = new StatementSplitter();
    const statements = [...splitter.push("INSERT INTO `t` VALUES (1,';');"), ...splitter.end()];
    expect(statements).toEqual(["INSERT INTO `t` VALUES (1,';');"]);
  });
});

describe("readDump", () => {
  const script = `${CREATE}\nINSERT INTO \`widget\` VALUES (1,'a','b',1,2.5,'2024-01-02 03:04:05.000000',0x41),(2,'c',NULL,0,NULL,NULL,NULL);\n`;

  it("streams a plain sql file", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "moj-import-"));
    const file = path.join(dir, "dump.sql");
    writeFileSync(file, script);
    const events = [];

    for await (const event of readDump(file)) events.push(event);
    expect(events[0]).toMatchObject({ kind: "table" });
    expect(events[1]).toMatchObject({ kind: "rows", table: "widget" });
    expect(events[1]?.kind === "rows" && events[1].rows).toHaveLength(2);
  });

  it("streams a gzipped file the same way", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "moj-import-"));
    const file = path.join(dir, "dump.sql.gz");
    writeFileSync(file, gzipSync(Buffer.from(script, "utf8")));
    const rows = [];

    for await (const event of readDump(file)) {
      if (event.kind === "rows") rows.push(...event.rows);
    }

    expect(rows).toHaveLength(2);
    expect(rows[0]?.[1]).toBe("a");
  });

  it("splits a huge insert that spans many stream chunks", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "moj-import-"));
    const file = path.join(dir, "big.sql");
    const filler = "x".repeat(4096);

    const tuples = Array.from(
      { length: 400 },
      (_, i) => `(${i},'n${i}','${filler};,\\'quoted\\'',1,NULL,NULL,NULL)`,
    ).join(",");

    writeFileSync(file, `${CREATE}\nINSERT INTO \`widget\` VALUES ${tuples};\n`);
    let count = 0;

    for await (const event of readDump(file)) {
      if (event.kind === "rows") count += event.rows.length;
    }

    expect(count).toBe(400);
  });
});
