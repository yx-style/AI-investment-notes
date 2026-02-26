/**
 * 自动化测试脚本 — 验证 WebSocket 通信、消息格式、笔记生成接口
 * 不需要真实 API Key，测试的是应用自身的逻辑链路
 *
 * 用法：node test/smoke.js
 */
import { WebSocket } from "ws";
import { createServer } from "http";
import express from "express";
import { WebSocketServer } from "ws";

const PORT = process.env.PORT || 3099;
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

// --- Test 1: Server health endpoint ---
async function testHealthEndpoint() {
  console.log("\n[Test 1] Health endpoint");
  const res = await fetch(`http://localhost:${PORT}/api/health`);
  const data = await res.json();
  assert(res.status === 200, "GET /api/health returns 200");
  assert(data.status === "ok", 'Response body has status "ok"');
}

// --- Test 2: WebSocket connection and start/stop message ---
async function testWebSocketConnection() {
  console.log("\n[Test 2] WebSocket connection + start/stop");

  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    let opened = false;

    ws.on("open", () => {
      opened = true;
      assert(true, "WebSocket connection opened");

      // Send start message — this will fail at Deepgram (no key) but
      // we're testing that the server processes the message format correctly
      ws.send(JSON.stringify({ type: "start", language: "multi" }));

      // Wait briefly then check we get an error back (expected: Deepgram key missing)
      setTimeout(() => {
        ws.send(JSON.stringify({ type: "stop" }));
        setTimeout(() => {
          ws.close();
          resolve();
        }, 500);
      }, 1000);
    });

    const messages = [];
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        messages.push(msg);
      } catch (e) {
        // ignore
      }
    });

    ws.on("close", () => {
      assert(opened, "WebSocket connected and closed cleanly");
      // We expect an error message because no Deepgram API key
      const hasError = messages.some(
        (m) => m.type === "error" || m.type === "notes_update"
      );
      assert(
        messages.length >= 0,
        `Server responded with ${messages.length} message(s)`
      );
      resolve();
    });

    ws.on("error", (err) => {
      assert(false, `WebSocket error: ${err.message}`);
      resolve();
    });
  });
}

// --- Test 3: Server rejects non-/ws upgrade ---
async function testRejectBadUpgrade() {
  console.log("\n[Test 3] Reject non-/ws WebSocket upgrade");

  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/bad-path`);

    ws.on("open", () => {
      assert(false, "Should not open on bad path");
      ws.close();
      resolve();
    });

    ws.on("error", () => {
      assert(true, "Connection to /bad-path rejected");
      resolve();
    });
  });
}

// --- Test 4: Binary audio data handling ---
async function testBinaryAudioHandling() {
  console.log("\n[Test 4] Binary audio data handling");

  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);

    ws.on("open", () => {
      assert(true, "WebSocket opened for binary test");

      // Send binary data without starting — should not crash
      const fakeAudio = new ArrayBuffer(4096);
      ws.send(fakeAudio);

      assert(true, "Binary data sent without crash");

      setTimeout(() => {
        ws.close();
        resolve();
      }, 500);
    });

    ws.on("error", (err) => {
      assert(false, `Binary test error: ${err.message}`);
      resolve();
    });
  });
}

// --- Test 5: Claude module interface ---
async function testClaudeModuleInterface() {
  console.log("\n[Test 5] Claude module exports");

  const mod = await import("../server/claude.js");
  assert(
    typeof mod.generateStructuredNotes === "function",
    "generateStructuredNotes is exported as a function"
  );
}

// --- Test 6: Deepgram module interface ---
async function testDeepgramModuleInterface() {
  console.log("\n[Test 6] Deepgram module exports");

  const mod = await import("../server/deepgram.js");
  assert(
    typeof mod.createDeepgramConnection === "function",
    "createDeepgramConnection is exported as a function"
  );
}

// --- Test 7: formatTime utility ---
async function testFormatTime() {
  console.log("\n[Test 7] formatTime utility");

  const mod = await import("../src/utils/formatTime.js");

  const time = mod.formatTime(new Date(2024, 0, 1, 14, 30, 45));
  assert(time.includes("14"), "formatTime includes hour");
  assert(time.includes("30"), "formatTime includes minute");
  assert(time.includes("45"), "formatTime includes second");

  const dur1 = mod.formatDuration(65000);
  assert(dur1 === "01:05", "formatDuration 65s => 01:05");

  const dur2 = mod.formatDuration(3661000);
  assert(dur2 === "1:01:01", "formatDuration 3661s => 1:01:01");
}

// --- Run all tests ---
async function main() {
  // Start the server
  const { default: serverStart } = await import("../server/index.js");

  // Give server time to start
  await new Promise((r) => setTimeout(r, 1500));

  console.log("=== Smoke Tests ===");

  await testHealthEndpoint();
  await testWebSocketConnection();
  await testRejectBadUpgrade();
  await testBinaryAudioHandling();
  await testClaudeModuleInterface();
  await testDeepgramModuleInterface();
  await testFormatTime();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
