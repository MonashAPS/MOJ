import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ImportContext } from "./context.ts";
import { extract } from "./extract.ts";
import { DryRunLoader, type Loader } from "./loader.ts";

/**
 * A tiny hand written dump covering every table the pipeline needs. It is not
 * derived from any real database.
 */
export const FIXTURE_DUMP = `
CREATE TABLE \`django_content_type\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`app_label\` varchar(100) NOT NULL,
  \`model\` varchar(100) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`django_content_type\` VALUES (1,'judge','problem'),(2,'judge','profile'),(3,'judge','contest'),(4,'judge','comment');

CREATE TABLE \`auth_permission\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`name\` varchar(255) NOT NULL,
  \`content_type_id\` int(11) NOT NULL,
  \`codename\` varchar(100) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`auth_permission\` VALUES (10,'Edit all problems',1,'edit_all_problem'),(11,'Rejudge',1,'rejudge_submission');

CREATE TABLE \`auth_group\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`name\` varchar(150) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`auth_group\` VALUES (1,'Site Admin');

CREATE TABLE \`auth_group_permissions\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`group_id\` int(11) NOT NULL,
  \`permission_id\` int(11) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`auth_group_permissions\` VALUES (1,1,11);

CREATE TABLE \`auth_user_groups\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`user_id\` int(11) NOT NULL,
  \`group_id\` int(11) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`auth_user_groups\` VALUES (1,1,1);

CREATE TABLE \`auth_user_user_permissions\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`user_id\` int(11) NOT NULL,
  \`permission_id\` int(11) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`auth_user_user_permissions\` VALUES (1,1,10);

CREATE TABLE \`auth_user\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`password\` varchar(128) NOT NULL,
  \`last_login\` datetime(6) DEFAULT NULL,
  \`is_superuser\` tinyint(1) NOT NULL,
  \`username\` varchar(150) NOT NULL,
  \`first_name\` varchar(150) NOT NULL,
  \`last_name\` varchar(150) NOT NULL,
  \`email\` varchar(254) NOT NULL,
  \`is_staff\` tinyint(1) NOT NULL,
  \`is_active\` tinyint(1) NOT NULL,
  \`date_joined\` datetime(6) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`auth_user\` VALUES
 (1,'pbkdf2_sha256$260000$salt$hash',NULL,1,'root','','','root@example.test',1,1,'2020-01-01 00:00:00.000000'),
 (2,'!unusable',NULL,0,'ghost','','','',0,0,'2021-02-03 04:05:06.000000'),
 (3,'pbkdf2_sha256$260000$salt2$hash2',NULL,0,'dup','','','root@example.test',0,1,'2022-01-01 00:00:00.000000');

CREATE TABLE \`judge_language\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`key\` varchar(6) NOT NULL,
  \`name\` varchar(20) NOT NULL,
  \`short_name\` varchar(10) DEFAULT NULL,
  \`common_name\` varchar(10) NOT NULL,
  \`ace\` varchar(20) NOT NULL,
  \`pygments\` varchar(20) NOT NULL,
  \`template\` longtext NOT NULL,
  \`info\` varchar(50) NOT NULL,
  \`description\` longtext NOT NULL,
  \`extension\` varchar(10) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`judge_language\` VALUES (5,'PY3','Python 3',NULL,'Python','python','python3','','3.11','','py');

CREATE TABLE \`judge_problemtype\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`name\` varchar(20) NOT NULL,
  \`full_name\` varchar(100) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`judge_problemtype\` VALUES (1,'adhoc','Ad Hoc');

CREATE TABLE \`judge_problemgroup\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`name\` varchar(20) NOT NULL,
  \`full_name\` varchar(100) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`judge_problemgroup\` VALUES (1,'uncat','Uncategorised');

CREATE TABLE \`judge_license\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`key\` varchar(20) NOT NULL,
  \`link\` varchar(256) NOT NULL,
  \`name\` varchar(256) NOT NULL,
  \`display\` varchar(256) NOT NULL,
  \`icon\` varchar(256) NOT NULL,
  \`text\` longtext NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`judge_license\` VALUES (1,'cc','https://example.test','CC','CC BY','','text');

CREATE TABLE \`judge_organization\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`name\` varchar(128) NOT NULL,
  \`slug\` varchar(128) NOT NULL,
  \`short_name\` varchar(20) NOT NULL,
  \`about\` longtext NOT NULL,
  \`creation_date\` datetime(6) NOT NULL,
  \`is_open\` tinyint(1) NOT NULL,
  \`slots\` int(11) DEFAULT NULL,
  \`access_code\` varchar(7) DEFAULT NULL,
  \`logo_override_image\` varchar(150) NOT NULL,
  \`class_required\` tinyint(1) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`judge_organization\` VALUES (1,'MAPS','maps','MAPS','about','2020-01-01 00:00:00.000000',1,NULL,NULL,'',0);

CREATE TABLE \`judge_organization_admins\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`organization_id\` int(11) NOT NULL,
  \`profile_id\` int(11) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`judge_organization_admins\` VALUES (1,1,1);

CREATE TABLE \`judge_profile_organizations\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`sort_value\` int(11) NOT NULL,
  \`profile_id\` int(11) NOT NULL,
  \`organization_id\` int(11) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`judge_profile_organizations\` VALUES (1,3,1,1),(2,0,2,1);

CREATE TABLE \`judge_profile\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`about\` longtext DEFAULT NULL,
  \`timezone\` varchar(50) NOT NULL,
  \`points\` double NOT NULL,
  \`performance_points\` double NOT NULL,
  \`problem_count\` int(11) NOT NULL,
  \`ace_theme\` varchar(30) NOT NULL,
  \`last_access\` datetime(6) NOT NULL,
  \`ip\` char(39) DEFAULT NULL,
  \`display_rank\` varchar(10) NOT NULL,
  \`mute\` tinyint(1) NOT NULL,
  \`is_unlisted\` tinyint(1) NOT NULL,
  \`rating\` int(11) DEFAULT NULL,
  \`user_script\` longtext NOT NULL,
  \`math_engine\` varchar(4) NOT NULL,
  \`is_totp_enabled\` tinyint(1) NOT NULL,
  \`totp_key\` longblob DEFAULT NULL,
  \`notes\` longtext DEFAULT NULL,
  \`current_contest_id\` int(11) DEFAULT NULL,
  \`language_id\` int(11) NOT NULL,
  \`user_id\` int(11) NOT NULL,
  \`api_token\` varchar(64) DEFAULT NULL,
  \`is_webauthn_enabled\` tinyint(1) NOT NULL,
  \`data_last_downloaded\` datetime(6) DEFAULT NULL,
  \`scratch_codes\` longblob DEFAULT NULL,
  \`last_totp_timecode\` int(11) NOT NULL,
  \`username_display_override\` varchar(100) NOT NULL,
  \`is_banned_from_problem_voting\` tinyint(1) NOT NULL,
  \`site_theme\` varchar(10) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`judge_profile\` VALUES
 (1,'hi','Australia/Melbourne',10,5,2,'auto','2024-05-06 07:08:09.000000','127.0.0.1','admin',0,0,1500,'','tex',0,NULL,'note',1,5,1,'abc123',0,NULL,NULL,0,'','',''),
 (2,NULL,'UTC',0,0,0,'chrome','2024-05-06 07:08:09.000000',NULL,'user',0,1,NULL,'','tex',0,NULL,NULL,NULL,5,2,NULL,0,NULL,NULL,0,'','','dark'),
 (3,NULL,'UTC',0,0,0,'auto','2024-05-06 07:08:09.000000',NULL,'wizard',0,0,NULL,'','tex',0,NULL,NULL,NULL,5,3,NULL,0,NULL,NULL,0,'','','light');

CREATE TABLE \`judge_problem\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`code\` varchar(20) NOT NULL,
  \`name\` varchar(100) NOT NULL,
  \`description\` longtext NOT NULL,
  \`time_limit\` double NOT NULL,
  \`memory_limit\` int(10) unsigned NOT NULL,
  \`short_circuit\` tinyint(1) NOT NULL,
  \`points\` double NOT NULL,
  \`partial\` tinyint(1) NOT NULL,
  \`is_public\` tinyint(1) NOT NULL,
  \`is_manually_managed\` tinyint(1) NOT NULL,
  \`date\` datetime(6) DEFAULT NULL,
  \`og_image\` varchar(150) NOT NULL,
  \`summary\` longtext NOT NULL,
  \`user_count\` int(11) NOT NULL,
  \`ac_rate\` double NOT NULL,
  \`is_organization_private\` tinyint(1) NOT NULL,
  \`group_id\` int(11) NOT NULL,
  \`license_id\` int(11) DEFAULT NULL,
  \`is_full_markup\` tinyint(1) NOT NULL,
  \`submission_source_visibility_mode\` varchar(1) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`judge_problem\` VALUES
 (1,'aplusb','A plus B','Add \\'em up',2,65536,0,100,0,1,0,'2023-03-04 05:06:07.000000','','sum',3,0.5,0,1,1,0,'A'),
 (2,'orphan','Orphan','',1,32768,0,10,0,0,0,NULL,'','',0,0,0,1,NULL,0,'X');

CREATE TABLE \`judge_problem_authors\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`problem_id\` int(11) NOT NULL,
  \`profile_id\` int(11) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`judge_problem_authors\` VALUES (1,1,1),(2,1,99);

CREATE TABLE \`judge_problem_types\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`problem_id\` int(11) NOT NULL,
  \`problemtype_id\` int(11) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`judge_problem_types\` VALUES (1,1,1);

CREATE TABLE \`judge_problem_allowed_languages\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`problem_id\` int(11) NOT NULL,
  \`language_id\` int(11) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`judge_problem_allowed_languages\` VALUES (1,1,5);

CREATE TABLE \`judge_contest\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`key\` varchar(20) NOT NULL,
  \`name\` varchar(100) NOT NULL,
  \`description\` longtext NOT NULL,
  \`start_time\` datetime(6) NOT NULL,
  \`end_time\` datetime(6) NOT NULL,
  \`time_limit\` bigint(20) DEFAULT NULL,
  \`is_visible\` tinyint(1) NOT NULL,
  \`is_rated\` tinyint(1) NOT NULL,
  \`use_clarifications\` tinyint(1) NOT NULL,
  \`rate_all\` tinyint(1) NOT NULL,
  \`is_private\` tinyint(1) NOT NULL,
  \`hide_problem_tags\` tinyint(1) NOT NULL,
  \`run_pretests_only\` tinyint(1) NOT NULL,
  \`og_image\` varchar(150) NOT NULL,
  \`logo_override_image\` varchar(150) NOT NULL,
  \`user_count\` int(11) NOT NULL,
  \`summary\` longtext NOT NULL,
  \`access_code\` varchar(255) NOT NULL,
  \`format_name\` varchar(32) NOT NULL,
  \`format_config\` longtext DEFAULT NULL,
  \`rating_ceiling\` int(11) DEFAULT NULL,
  \`rating_floor\` int(11) DEFAULT NULL,
  \`is_organization_private\` tinyint(1) NOT NULL,
  \`problem_label_script\` longtext NOT NULL,
  \`points_precision\` int(11) NOT NULL,
  \`scoreboard_visibility\` varchar(1) NOT NULL,
  \`locked_after\` datetime(6) DEFAULT NULL,
  \`hide_problem_authors\` tinyint(1) NOT NULL,
  \`show_short_display\` tinyint(1) NOT NULL,
  \`tester_see_scoreboard\` tinyint(1) NOT NULL,
  \`limit_join_organizations\` tinyint(1) NOT NULL,
  \`tester_see_submissions\` tinyint(1) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`judge_contest\` VALUES
 (1,'week1','Week 1','desc','2024-03-01 09:00:00.000000','2024-03-01 14:00:00.000000',18000000000,1,1,1,0,0,0,0,'','',2,'','','icpc','{\\"penalty\\": 20}',NULL,NULL,0,'',2,'C',NULL,0,0,1,0,1),
 (2,'week2','Week 2','','2024-04-01 09:00:00.000000','2024-04-01 14:00:00.000000',NULL,0,0,0,0,0,0,0,'','',0,'','','default',NULL,NULL,NULL,0,'return "X"',0,'Z',NULL,0,0,0,0,0),
 (3,'week3','Week 3','','2024-05-01 09:00:00.000000','2024-05-01 14:00:00.000000',NULL,1,0,1,0,0,0,0,'','',0,'','','default',NULL,NULL,NULL,0,'',3,'V',NULL,0,0,0,0,0);

CREATE TABLE \`judge_contestproblem\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`points\` int(11) NOT NULL,
  \`partial\` tinyint(1) NOT NULL,
  \`is_pretested\` tinyint(1) NOT NULL,
  \`order\` int(10) unsigned NOT NULL,
  \`output_prefix_override\` int(11) DEFAULT NULL,
  \`max_submissions\` int(11) DEFAULT NULL,
  \`contest_id\` int(11) NOT NULL,
  \`problem_id\` int(11) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`judge_contestproblem\` VALUES (1,100,0,0,1,NULL,NULL,1,1),(4,50,1,0,2,NULL,NULL,1,2);

CREATE TABLE \`judge_contestparticipation\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`start\` datetime(6) NOT NULL,
  \`score\` double NOT NULL,
  \`cumtime\` int(10) unsigned NOT NULL,
  \`virtual\` int(11) NOT NULL,
  \`format_data\` longtext DEFAULT NULL,
  \`contest_id\` int(11) NOT NULL,
  \`user_id\` int(11) NOT NULL,
  \`is_disqualified\` tinyint(1) NOT NULL,
  \`tiebreaker\` double NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`judge_contestparticipation\` VALUES
 (1,'2024-03-01 09:00:00.000000',100,42,0,'{\\"1\\": {\\"points\\": 100}, \\"4\\": {\\"points\\": 50}, \\"999\\": {\\"points\\": 1}}',1,1,0,0),
 (2,'2024-03-01 09:00:00.000000',0,0,0,NULL,1,2,0,0);

CREATE TABLE \`judge_submission\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`date\` datetime(6) NOT NULL,
  \`time\` double DEFAULT NULL,
  \`memory\` double DEFAULT NULL,
  \`points\` double DEFAULT NULL,
  \`status\` varchar(2) NOT NULL,
  \`result\` varchar(3) DEFAULT NULL,
  \`error\` longtext DEFAULT NULL,
  \`current_testcase\` int(11) NOT NULL,
  \`batch\` tinyint(1) NOT NULL,
  \`case_points\` double NOT NULL,
  \`case_total\` double NOT NULL,
  \`is_pretested\` tinyint(1) NOT NULL,
  \`judged_on_id\` int(11) DEFAULT NULL,
  \`language_id\` int(11) NOT NULL,
  \`problem_id\` int(11) NOT NULL,
  \`user_id\` int(11) NOT NULL,
  \`contest_object_id\` int(11) DEFAULT NULL,
  \`judged_date\` datetime(6) DEFAULT NULL,
  \`locked_after\` datetime(6) DEFAULT NULL,
  \`rejudged_date\` datetime(6) DEFAULT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`judge_submission\` VALUES
 (1,'2024-03-01 09:30:00.000000',0.05,12.5,100,'D','AC',NULL,0,0,10,10,0,NULL,5,1,1,1,'2024-03-01 09:30:05.000000',NULL,NULL),
 (2,'2024-03-02 09:30:00.000000',NULL,NULL,NULL,'QU',NULL,NULL,0,0,0,0,0,NULL,5,1,2,NULL,NULL,NULL,NULL),
 (3,'2024-03-03 09:30:00.000000',NULL,NULL,NULL,'ZZ','ZZZ',NULL,0,0,0,0,0,NULL,5,1,99,NULL,NULL,NULL,NULL);

CREATE TABLE \`judge_contestsubmission\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`points\` double NOT NULL,
  \`is_pretest\` tinyint(1) NOT NULL,
  \`participation_id\` int(11) NOT NULL,
  \`problem_id\` int(11) NOT NULL,
  \`submission_id\` int(11) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`judge_contestsubmission\` VALUES (1,100,0,1,1,1);

CREATE TABLE \`judge_submissionsource\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`source\` longtext NOT NULL,
  \`submission_id\` int(11) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`judge_submissionsource\` VALUES (1,'print(sum(map(int, input().split())))\\n',1);

CREATE TABLE \`judge_submissiontestcase\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`case\` int(11) NOT NULL,
  \`status\` varchar(3) NOT NULL,
  \`time\` double DEFAULT NULL,
  \`memory\` double DEFAULT NULL,
  \`points\` double DEFAULT NULL,
  \`total\` double DEFAULT NULL,
  \`batch\` int(11) DEFAULT NULL,
  \`feedback\` varchar(50) NOT NULL,
  \`extended_feedback\` longtext NOT NULL,
  \`output\` longtext NOT NULL,
  \`submission_id\` int(11) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`judge_submissiontestcase\` VALUES (1,1,'AC',0.01,12.5,10,10,NULL,'','','',1);

CREATE TABLE \`judge_blogpost\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`title\` varchar(100) NOT NULL,
  \`slug\` varchar(50) NOT NULL,
  \`visible\` tinyint(1) NOT NULL,
  \`sticky\` tinyint(1) NOT NULL,
  \`publish_on\` datetime(6) NOT NULL,
  \`content\` longtext NOT NULL,
  \`summary\` longtext NOT NULL,
  \`og_image\` varchar(150) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`judge_blogpost\` VALUES (7,'Welcome','welcome',1,0,'2024-01-01 00:00:00.000000','body','sum','');

CREATE TABLE \`judge_comment\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`time\` datetime(6) NOT NULL,
  \`page\` varchar(30) NOT NULL,
  \`score\` int(11) NOT NULL,
  \`body\` longtext NOT NULL,
  \`hidden\` tinyint(1) NOT NULL,
  \`lft\` int(10) unsigned NOT NULL,
  \`rght\` int(10) unsigned NOT NULL,
  \`tree_id\` int(10) unsigned NOT NULL,
  \`level\` int(10) unsigned NOT NULL,
  \`author_id\` int(11) NOT NULL,
  \`parent_id\` int(11) DEFAULT NULL,
  \`revisions\` int(11) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`judge_comment\` VALUES
 (1,'2024-02-01 00:00:00.000000','p:aplusb',2,'nice',0,1,4,1,0,1,NULL,1),
 (2,'2024-02-02 00:00:00.000000','p:aplusb',0,'thanks',0,2,3,1,1,2,1,1),
 (3,'2024-02-03 00:00:00.000000','b:7',0,'hello',0,1,2,2,0,1,NULL,1),
 (4,'2024-02-04 00:00:00.000000','c:week1',0,'gl',0,1,2,3,0,1,NULL,1),
 (5,'2024-02-05 00:00:00.000000','s:aplusb',0,'ed',0,1,2,4,0,1,NULL,1),
 (6,'2024-02-06 00:00:00.000000','x:weird',0,'?',0,1,2,5,0,1,NULL,1);

CREATE TABLE \`judge_ticket\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`title\` varchar(100) NOT NULL,
  \`time\` datetime(6) NOT NULL,
  \`notes\` longtext NOT NULL,
  \`object_id\` int(10) unsigned NOT NULL,
  \`is_open\` tinyint(1) NOT NULL,
  \`content_type_id\` int(11) NOT NULL,
  \`user_id\` int(11) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`judge_ticket\` VALUES (1,'Typo','2024-02-10 00:00:00.000000','',1,1,1,2),(2,'Other','2024-02-11 00:00:00.000000','',2,1,2,1);

CREATE TABLE \`judge_navigationbar\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`order\` int(10) unsigned NOT NULL,
  \`key\` varchar(10) NOT NULL,
  \`label\` varchar(20) NOT NULL,
  \`path\` varchar(255) NOT NULL,
  \`regex\` longtext NOT NULL,
  \`lft\` int(10) unsigned NOT NULL,
  \`rght\` int(10) unsigned NOT NULL,
  \`tree_id\` int(10) unsigned NOT NULL,
  \`level\` int(10) unsigned NOT NULL,
  \`parent_id\` int(11) DEFAULT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`judge_navigationbar\` VALUES (2,1,'child','Child','/problems/','^/problems',2,3,1,1,1),(1,0,'root','Root','/','^/$',1,4,1,0,NULL);

CREATE TABLE \`reversion_revision\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`date_created\` datetime(6) NOT NULL,
  \`comment\` longtext NOT NULL,
  \`user_id\` int(11) DEFAULT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`reversion_revision\` VALUES (1,'2024-02-20 00:00:00.000000','Fixed a typo',1);

CREATE TABLE \`reversion_version\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`object_id\` varchar(191) NOT NULL,
  \`format\` varchar(255) NOT NULL,
  \`serialized_data\` longtext NOT NULL,
  \`object_repr\` longtext NOT NULL,
  \`content_type_id\` int(11) NOT NULL,
  \`revision_id\` int(11) NOT NULL,
  \`db\` varchar(191) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`reversion_version\` VALUES
 (1,'1','json','[{\\"model\\": \\"judge.problem\\", \\"pk\\": 1, \\"fields\\": {\\"name\\": \\"A plus B\\"}}]','A plus B',1,1,'default'),
 (2,'5','json','[]','gone',1,1,'default'),
 (3,'1','json','[]','profile',2,1,'default');

CREATE TABLE \`judge_webauthncredential\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`name\` varchar(100) NOT NULL,
  \`cred_id\` varchar(255) NOT NULL,
  \`public_key\` longtext NOT NULL,
  \`counter\` bigint(20) NOT NULL,
  \`user_id\` int(11) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
INSERT INTO \`judge_webauthncredential\` VALUES (1,'YubiKey','Y3JlZC1pZA','pQECAyYg','7',1);
`;

export interface Fixture {
  ctx: ImportContext;
  dir: string;
  loader: Loader;
}

export async function makeFixtureContext(loader?: Loader, tables?: Set<string>): Promise<Fixture> {
  const dir = mkdtempSync(path.join(tmpdir(), "moj-import-fixture-"));
  const dumpPath = path.join(dir, "dump.sql");
  writeFileSync(dumpPath, FIXTURE_DUMP);
  const manifest = await extract({ dumpPath, outDir: dir });
  const used = loader ?? new DryRunLoader(path.join(dir, "docs"));

  const ctx = new ImportContext(manifest, used, {
    outDir: dir,
    dryRun: true,
    tables,
    clear: false,
  });

  return { ctx, dir, loader: used };
}
