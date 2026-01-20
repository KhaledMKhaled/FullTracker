import { readFile, writeFile } from "fs/promises";

const patches = [
  {
    file: "node_modules/tailwindcss/lib/corePlugins.js",
    find: "parse(_fs.default.readFileSync(_path.join(__dirname, \"./css/preflight.css\"), \"utf8\"))",
    replace:
      "parse(_fs.default.readFileSync(_path.join(__dirname, \"./css/preflight.css\"), \"utf8\"), { from: undefined })",
  },
  {
    file: "node_modules/tailwindcss/lib/lib/generateRules.js",
    find: "_postcss.default.parse(`a{${property}:${value}}`).toResult();",
    replace:
      "_postcss.default.parse(`a{${property}:${value}}`, { from: undefined }).toResult();",
  },
];

let updated = false;

for (const { file, find, replace } of patches) {
  const contents = await readFile(file, "utf8");
  if (contents.includes(replace)) {
    continue;
  }
  if (!contents.includes(find)) {
    throw new Error(`Patch target not found in ${file}`);
  }

  const nextContents = contents.replace(find, replace);
  await writeFile(file, nextContents, "utf8");
  updated = true;
}

if (updated) {
  console.log("Patched tailwindcss to pass PostCSS 'from' option.");
}
