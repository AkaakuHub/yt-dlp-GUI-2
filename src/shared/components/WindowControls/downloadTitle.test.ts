import assert from "node:assert/strict";
import test from "node:test";
import { createDownloadTitle, defaultDocumentTitle } from "./downloadTitle.ts";

test("creates a title with the remaining time and download title", () => {
	assert.equal(
		createDownloadTitle("残り 43:21 (14.4%)", "動画タイトル", 0),
		"残り 43:21 (14.4%) 動画タイトル",
	);
});

test("decrements the remaining time once per second", () => {
	assert.equal(
		createDownloadTitle("残り 1:00:00 (14.4%)", "動画タイトル", 1),
		"残り 59:59 (14.4%) 動画タイトル",
	);
});

test("uses the application title when no download information exists", () => {
	assert.equal(createDownloadTitle("", "", 0), defaultDocumentTitle());
});
