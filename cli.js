#!/usr/bin/env node
"use strict";

const { run } = require("./lib/cli-wrapper");

run(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
