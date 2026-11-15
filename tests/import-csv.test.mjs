import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Load the app's ES modules without a bundler, exactly like the other test file.
const asUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const rules = asUrl(await readFile(new URL("../lib/enforce-rules.js", import.meta.url), "utf8"));
const csvSource = (await readFile(new URL("../lib/csv.js", import.meta.url), "utf8"))
  .replace('"./enforce-rules"', JSON.stringify(rules));
const { buildMagnificCsv, getMagnificRowIssues } = await import(asUrl(csvSource));
const { parseMetadataCsv, buildMetadataCsvTemplate, MAGNIFIC_CSV_COLUMNS } = await import(
  asUrl(await readFile(new URL("../lib/import-csv.js", import.meta.url), "utf8"))
);

const item = (filename, meta = {}, importedMetadata) => ({
  filename,
  ...(importedMetadata ? { importedMetadata } : {}),
  result: {
    description: "",
    platforms: {
      freepik_vecteezy: { title: "Friendly robot waving its hand", keywords: ["robot", "cartoon"], ...meta },
    },
  },
});

test("Magnific's documented CSV header imports without losing keywords", () => {
  const csv = [
    "File name;Title;Keywords;Prompt;Model",
    "robot.eps;Friendly robot waving;robot,cartoon,ai;A robot waving;Leonardo",
    "cat.eps;Sleeping cat;cat,pet;;",
  ].join("\r\n");
  const parsed = parseMetadataCsv(csv);
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.layout, "header");
  assert.equal(parsed.records.length, 2);
  assert.deepEqual(
    parsed.records.map((r) => [r.filename, r.title, r.tags, r.ai_prompt, r.ai_model]),
    [
      ["robot.eps", "Friendly robot waving", "robot,cartoon,ai", "A robot waving", "Leonardo"],
      ["cat.eps", "Sleeping cat", "cat,pet", "", ""],
    ]
  );
});

test("a headerless Magnific CSV is read positionally instead of rejected", () => {
  // Titles and keyword lists contain commas; the file separator is still ";".
  const csv = "robot.eps;Friendly robot, waving;robot,cartoon\r\ncat.eps;Sleeping cat, on a sofa;cat,pet";
  const parsed = parseMetadataCsv(csv);
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.layout, "magnific");
  assert.equal(parsed.delimiter, ";");
  assert.deepEqual(
    parsed.records.map((r) => [r.filename, r.title, r.tags]),
    [
      ["robot.eps", "Friendly robot, waving", "robot,cartoon"],
      ["cat.eps", "Sleeping cat, on a sofa", "cat,pet"],
    ]
  );
});

test("older Freepik exports that single-quote every field still match", () => {
  const parsed = parseMetadataCsv("'robot.eps';'Friendly robot';'robot, cartoon'\r\n");
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.records[0].filename, "robot.eps");
  assert.equal(parsed.records[0].title, "Friendly robot");
  assert.equal(parsed.records[0].tags, "robot, cartoon");
});

test("filename cells that carry a path still match the queue", () => {
  const parsed = parseMetadataCsv("filename,title,keywords\r\n./exports/robot.eps,Robot,robot;cartoon");
  assert.equal(parsed.records[0].filename, "robot.eps");
  assert.equal(parsed.records[0].tags, "robot;cartoon");
});

test("other tools' headers are understood: Filename/Description/Keywords", () => {
  const adobe = parseMetadataCsv('Filename,Title,Keywords,Category,Releases\r\nrobot.eps,Robot,"robot, cartoon",,,');
  assert.equal(adobe.records[0].title, "Robot");
  assert.equal(adobe.records[0].tags, "robot, cartoon");
  const shutterstock = parseMetadataCsv(
    'Filename,Description,Keywords,Categories,Illustration,Mature content,Editorial\r\nrobot.eps,Robot waving,"robot, cartoon",,No,No,No'
  );
  assert.equal(shutterstock.records[0].title, "Robot waving");
  assert.equal(shutterstock.records[0].tags, "robot, cartoon");
});

test("the app's own export round trips every column", () => {
  const csv = buildMagnificCsv([item("robot.eps", {}, { is_ai: "yes", ai_prompt: "A robot", ai_model: "Leonardo" })]);
  const record = parseMetadataCsv(csv).records[0];
  assert.deepEqual(
    [record.filename, record.title, record.tags, record.is_ai, record.ai_prompt, record.ai_model],
    ["robot.eps", "Friendly robot waving its hand", "robot,cartoon", "yes", "A robot", "Leonardo"]
  );
  assert.equal(buildMetadataCsvTemplate(), `${MAGNIFIC_CSV_COLUMNS.join(";")}\r\n`);
});

test("a file with no filename column explains what is missing", () => {
  const parsed = parseMetadataCsv("title;keywords\r\nRobot;robot,cartoon");
  assert.equal(parsed.error, "The first row must be the header. Missing columns: filename. Start the file with filename (or File name), then title, tags/keywords, ai_prompt and ai_model.");
});

test("empty and filename-less files are reported, not silently accepted", () => {
  assert.match(parseMetadataCsv("").error, /empty/i);
  assert.match(parseMetadataCsv("filename;title\r\n;Robot").error, /No filenames/i);
});

test("Magnific export leaves out titleless rows and reports them", () => {
  const good = item("robot.eps");
  const titleless = item("empty.eps", { title: "", keywords: [] });
  const csv = buildMagnificCsv([good, titleless]);
  assert.equal(csv.split("\r\n").length, 2, "header plus one complete row");
  assert.ok(!csv.includes("empty.eps"));
  assert.deepEqual(getMagnificRowIssues([good, titleless]), [{ filename: "empty.eps", problems: ["no title", "no keywords"] }]);
});

test("Magnific rows never exceed the 100 character title or 50 keyword caps", () => {
  const longTitle = `${"Colorful gradient background vector ".repeat(6)}for social media and banner`;
  const manyKeywords = Array.from({ length: 60 }, (_, i) => `kw${i}`);
  const csv = buildMagnificCsv([item("big.eps", { title: longTitle, keywords: manyKeywords })]);
  const record = parseMetadataCsv(csv).records[0];
  assert.ok(record.title.length <= 100, `title was ${record.title.length} characters`);
  assert.ok(!/ for social media/i.test(record.title), "use-case tail is stripped");
  assert.equal(record.tags.split(",").length, 50);
});
