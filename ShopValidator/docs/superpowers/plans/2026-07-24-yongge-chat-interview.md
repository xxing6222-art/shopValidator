# Yongge Chat Interview Implementation Plan

> Status: superseded. The product now uses the original `origin/main`
> interview surface; this document remains only as implementation history.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair both landing-page entry points and replace only the interview step with a responsive Yongge chat experience while preserving the existing question, fact, review, analysis, and Worker logic.

**Architecture:** Add a small pure JavaScript chat-state module that deduplicates and rewinds visible messages. Keep `app.js` as the owner of interview behavior and call the chat module only when existing question/answer state changes. Use local hash/query routes for recoverable entry points and reuse the current demo mode instead of the retired external demo host.

**Tech Stack:** Static HTML/CSS, browser JavaScript, CommonJS-compatible JavaScript unit tests, Python Playwright end-to-end tests, Cloudflare Wrangler.

## Global Constraints

- Preserve the existing `beginInterview`, `askQuestion`, `confirmAnswerDraft`, `submitRemoteTurn`, `startDemoInterview`, `finishInterview`, review, analysis, and Worker API behavior.
- Do not change question count, question order, completion rules, fact fields, decision rules, result algorithms, or data models.
- Use the five existing Yongge paper-cutout PNG files from `C:/Users/11968/Desktop/picture/`.
- Desktop chat width is at most `520px`; the mobile chat uses the available width and must not create horizontal scrolling at `390px`.
- The demo entry must use local `/?demo=1`; it must not depend on `demo.yongge.zhangyvjing.com`.
- Every behavior change follows red-green-refactor and retains the existing Paper Ledger visual system outside the interview panel.

---

### Task 1: Pure Chat Message State

**Files:**
- Create: `interview-chat.js`
- Create: `test_interview_chat.js`

**Interfaces:**
- Produces: `YonggeInterviewChat.createModel() -> { messages: Array }`
- Produces: `YonggeInterviewChat.append(model, message) -> Array`
- Produces: `YonggeInterviewChat.rewind(model, questionIndex) -> Array`
- Produces: `YonggeInterviewChat.clear(model) -> Array`
- Message shape: `{ key: string, role: "assistant" | "user" | "system", text: string, questionIndex: number, avatarIndex: number }`

- [ ] **Step 1: Write the failing unit test**

```js
const assert = require("node:assert/strict");
const Chat = require("./interview-chat.js");

const model = Chat.createModel();
Chat.append(model, {
  key: "question-0",
  role: "assistant",
  text: "这家店一个月大约收多少钱？",
  questionIndex: 0,
  avatarIndex: 0
});
Chat.append(model, {
  key: "answer-turn-1",
  role: "user",
  text: "一个月大约十二万",
  questionIndex: 0,
  avatarIndex: 0
});
Chat.append(model, {
  key: "answer-turn-1",
  role: "user",
  text: "一个月大约十二万",
  questionIndex: 0,
  avatarIndex: 0
});
assert.equal(model.messages.length, 2);

Chat.append(model, {
  key: "question-1",
  role: "assistant",
  text: "所有员工工资每月一共多少？",
  questionIndex: 1,
  avatarIndex: 1
});
Chat.rewind(model, 0);
assert.deepEqual(model.messages.map((message) => message.key), ["question-0"]);

Chat.clear(model);
assert.deepEqual(model.messages, []);
console.log("interview chat state tests passed");
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node test_interview_chat.js`

Expected: FAIL with `Cannot find module './interview-chat.js'`.

- [ ] **Step 3: Implement the minimal chat module**

```js
(function exposeInterviewChat(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.YonggeInterviewChat = api;
})(typeof window !== "undefined" ? window : globalThis, function buildInterviewChat() {
  function createModel() {
    return { messages: [] };
  }

  function append(model, message) {
    if (!model || !Array.isArray(model.messages)) throw new TypeError("A chat model is required");
    if (!message?.key || !message?.text) return model.messages;
    const existing = model.messages.findIndex((item) => item.key === message.key);
    if (existing >= 0) model.messages[existing] = { ...model.messages[existing], ...message };
    else model.messages.push({ avatarIndex: 0, questionIndex: 0, ...message });
    return model.messages;
  }

  function rewind(model, questionIndex) {
    model.messages = model.messages.filter((message) => (
      message.questionIndex < questionIndex
      || (message.questionIndex === questionIndex && message.role === "assistant")
    ));
    return model.messages;
  }

  function clear(model) {
    model.messages = [];
    return model.messages;
  }

  return { createModel, append, rewind, clear };
});
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node test_interview_chat.js`

Expected: `interview chat state tests passed`.

- [ ] **Step 5: Commit the isolated module**

```bash
git add interview-chat.js test_interview_chat.js
git commit -m "feat: add interview chat message state"
```

### Task 2: Recoverable Local Entry Routes

**Files:**
- Modify: `index.html:28-29`
- Modify: `app.js:8-11,160-172,2243-2307`
- Modify: `test_location_e2e.py:200-230`

**Interfaces:**
- Produces: `routeProductView() -> void`, driven by `window.location.hash`.
- Changes: `enterWorkspace({ syncHash = true } = {}) -> void`.
- Consumes: existing `setProductView()` and `setPanel()`.

- [ ] **Step 1: Add failing browser assertions**

Add to `test_landing_and_workspace_are_separate`:

```python
expect(page.get_by_test_id("hero-demo")).to_have_attribute("href", "/?demo=1")
page.get_by_test_id("hero-start").click()
expect(page).to_have_url(re.compile(r"#judge$"))
expect(page.locator("body")).to_have_attribute("data-product-view", "workspace")
page.reload(wait_until="domcontentloaded")
expect(page.locator("body")).to_have_attribute("data-product-view", "workspace")
page.evaluate("() => { window.location.hash = 'top'; }")
expect(page.locator("body")).to_have_attribute("data-product-view", "landing")
```

Add `import re` at the top of `test_location_e2e.py`.

- [ ] **Step 2: Run the focused E2E and verify RED**

Run: `.\.wrangler\e2e-venv\Scripts\python.exe test_location_e2e.py`

Expected: FAIL because the demo href is external and the start click does not update the URL hash.

- [ ] **Step 3: Implement local routes**

Change the two links:

```html
<a class="primary-button" href="#judge" data-testid="hero-start">开始店铺问诊</a>
<a class="demo-button" href="/?demo=1" data-testid="hero-demo">查看诊断示例 <span>→</span></a>
```

Replace the external demo constant and workspace entry code with:

```js
function enterWorkspace({ syncHash = true } = {}) {
  if (syncHash && window.location.hash !== "#judge") {
    window.history.pushState(null, "", `${window.location.pathname}${window.location.search}#judge`);
  }
  setProductView("workspace");
  setPanel("location");
}

function routeProductView() {
  if (DEMO_MODE || window.location.hash === "#judge") {
    enterWorkspace({ syncHash: false });
    return;
  }
  setProductView("landing");
}
```

Update the demo loader and event bindings:

```js
function loadDemo() {
  if (!DEMO_MODE) {
    window.location.assign("/?demo=1");
    return;
  }
  state.demoPlaybackToken += 1;
  resetFlow();
  configureDemoLanding();
}

document.querySelector("[data-testid=hero-start]").addEventListener("click", (event) => {
  event.preventDefault();
  enterWorkspace();
});
window.addEventListener("hashchange", routeProductView);
configureDemoLanding();
routeProductView();
```

The brand click must set `#top` before returning to landing:

```js
window.history.pushState(null, "", `${window.location.pathname}${window.location.search}#top`);
setProductView("landing", { scroll: true });
```

- [ ] **Step 4: Run the focused E2E and verify GREEN**

Run: `.\.wrangler\e2e-venv\Scripts\python.exe test_location_e2e.py`

Expected: all current E2E cases pass, including local entry assertions.

- [ ] **Step 5: Commit entry routing**

```bash
git add index.html app.js test_location_e2e.py
git commit -m "fix: restore local diagnosis entry routes"
```

### Task 3: Chat Markup, Assets, and Paper Ledger Styling

**Files:**
- Modify: `index.html:194-221,323-325`
- Modify: `styles.css`
- Modify: `build_site.py:16-25`
- Create: `assets/yongge-main.png`
- Create: `assets/yongge-collar.png`
- Create: `assets/yongge-hands.png`
- Create: `assets/yongge-point.png`
- Create: `assets/yongge-think.png`
- Modify: `test_location_e2e.py`

**Interfaces:**
- Produces DOM IDs: `interviewThread`, `chatProgress`, `interviewBack`, `voiceInputButton`.
- Preserves DOM IDs consumed by `app.js`: `listeningPill`, `listeningLabel`, `questionProgress`, `currentQuestion`, `questionHint`, `liveTranscript`, `transcriptMode`, `textFallback`, `fallbackAnswer`, `confirmAnswer`, `previousQuestion`, `fillPresetAnswers`, `interviewNotice`.
- Loads `interview-chat.js` before `app.js`.
- Loads Google Material Symbols Outlined for the back, microphone, and send controls.

- [ ] **Step 1: Add failing structure and mobile-layout assertions**

After entering the interview panel in `test_location_and_text_fallback`, add:

```python
expect(page.locator("#interviewThread")).to_be_visible()
expect(page.locator(".chat-header")).to_contain_text("勇哥判店")
expect(page.locator("#chatProgress")).to_contain_text("AI 开店诊断")
expect(page.locator("#voiceInputButton")).to_be_visible()
```

Add a new test:

```python
def test_mobile_interview_chat_layout(browser, base_url: str) -> None:
    context = browser.new_context(
        base_url=base_url,
        locale="zh-CN",
        viewport={"width": 390, "height": 844},
    )
    context.route("**/api/**", api_fixture)
    page = context.new_page()
    page.goto("/#judge", wait_until="domcontentloaded")
    confirm_manual_location(page)
    page.locator("#beginInterview").click()
    expect(page.locator("#interviewThread")).to_be_visible(timeout=8_000)
    layout = page.evaluate(
        """() => ({
          viewport: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          panelWidth: document.getElementById('interviewPanel').getBoundingClientRect().width,
          composerWidth: document.getElementById('textFallback').getBoundingClientRect().width
        })"""
    )
    assert layout["scrollWidth"] <= layout["viewport"], layout
    assert layout["panelWidth"] <= layout["viewport"], layout
    assert layout["composerWidth"] <= layout["panelWidth"], layout
    context.close()
```

- [ ] **Step 2: Run E2E and verify RED**

Run: `.\.wrangler\e2e-venv\Scripts\python.exe test_location_e2e.py`

Expected: FAIL because the chat DOM and voice control do not exist.

- [ ] **Step 3: Copy and whitelist the supplied images**

Copy the five source files to the listed `assets/` names without modifying the sources. Update `build_site.py`:

```python
PUBLIC_FILES = (
    "index.html", "ranking.html", "ranking.js", "styles.css",
    "fact-store.js", "decision-engine.js", "interview-chat.js", "app.js",
)
PUBLIC_ASSETS = (
    "yongge-main.png", "yongge-collar.png", "yongge-hands.png",
    "yongge-point.png", "yongge-think.png",
)

# after PUBLIC_FILES are copied
(DIST / "assets").mkdir(parents=True)
for filename in PUBLIC_ASSETS:
    shutil.copy2(ROOT / "assets" / filename, DIST / "assets" / filename)
```

- [ ] **Step 4: Replace only the interview panel markup**

Use this structure while retaining all existing IDs:

```html
<section class="flow-card flow-panel interview-panel chat-shell" id="interviewPanel" data-panel="interview" hidden data-testid="interview-step">
  <header class="chat-header">
    <button id="interviewBack" class="chat-icon-button" type="button" aria-label="返回位置确认"><span class="material-symbols-outlined" aria-hidden="true">arrow_back</span></button>
    <strong>勇哥判店</strong>
    <span class="chat-online"><i></i>在线</span>
  </header>
  <div class="chat-diagnosis-strip">
    <span id="chatProgress">AI 开店诊断 · 0 个问题</span>
    <span class="listening-pill" id="listeningPill"><i></i><b id="listeningLabel">正在准备</b></span>
    <span id="questionProgress" data-testid="question-progress">第 1 / 6-12</span>
  </div>
  <h3 id="currentQuestion" class="visually-hidden" data-testid="current-question">正在准备第一个问题…</h3>
  <p id="questionHint" class="visually-hidden"></p>
  <div class="chat-thread" id="interviewThread" aria-live="polite" data-testid="interview-thread"></div>
  <div class="chat-transcript">
    <p id="liveTranscript" aria-live="polite" data-testid="live-transcript">语音识别会即时写入下方输入框</p>
    <small id="transcriptMode">正在准备语音识别…</small>
  </div>
  <form class="text-fallback chat-composer" id="textFallback" data-testid="text-fallback">
    <button id="voiceInputButton" class="chat-icon-button" type="button" aria-label="开始语音输入"><span class="material-symbols-outlined" aria-hidden="true">mic</span></button>
    <label class="visually-hidden" for="fallbackAnswer">回答</label>
    <textarea id="fallbackAnswer" rows="1" placeholder="请输入你的回答…"></textarea>
    <button type="submit" class="chat-send-button" id="confirmAnswer" aria-label="发送回答"><span class="material-symbols-outlined" aria-hidden="true">send</span></button>
  </form>
  <div class="interview-controls">
    <button class="secondary-button" id="previousQuestion" type="button" data-testid="previous-question" disabled>上一题</button>
    <button class="secondary-button" id="fillPresetAnswers" type="button" data-testid="fill-preset-answers">填充预定答案</button>
  </div>
  <p class="interview-note" id="interviewNotice" role="status" aria-live="polite"></p>
</section>
```

Add this font link in `<head>` and load `<script src="interview-chat.js"></script>` immediately before `app.js`:

```html
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@400,0&display=swap" rel="stylesheet">
```

- [ ] **Step 5: Add focused chat CSS**

Append a `Yongge chat interview` section to `styles.css` with these exact constraints:

```css
.chat-shell {
  width: min(100%, 520px);
  min-height: min(760px, calc(100dvh - 80px));
  margin-inline: auto;
  padding: 0;
  overflow: hidden;
  background: #5c3218;
  color: #f5ead7;
}
.chat-header, .chat-diagnosis-strip, .chat-composer {
  display: flex;
  align-items: center;
}
.chat-header { min-height: 64px; padding: 12px 16px; border-bottom: 1px solid rgba(245,234,215,.2); }
.chat-header strong { flex: 1; text-align: center; }
.chat-online { color: #8dd58a; }
.chat-online i { display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 50%; background: currentColor; }
.chat-diagnosis-strip { min-height: 48px; gap: 10px; padding: 8px 16px; flex-wrap: wrap; border-bottom: 1px solid rgba(245,234,215,.12); }
.chat-thread { min-height: 430px; max-height: 56dvh; overflow-y: auto; padding: 20px 16px; }
.chat-message { display: flex; align-items: flex-end; gap: 10px; margin: 0 0 18px; }
.chat-message.user { justify-content: flex-end; }
.chat-avatar { width: 58px; height: 82px; flex: 0 0 58px; object-fit: contain; }
.chat-bubble { max-width: 76%; padding: 12px 14px; background: #aa957c; color: #3b281e; border-radius: 6px 6px 6px 0; }
.chat-message.user .chat-bubble { background: #58b6dd; color: #fff; border-radius: 6px 6px 0 6px; }
.chat-transcript { padding: 8px 16px; border-top: 1px solid rgba(245,234,215,.12); }
.chat-transcript p { margin: 0; }
.chat-composer { gap: 8px; padding: 12px 14px; border-top: 1px solid rgba(245,234,215,.2); }
.chat-composer textarea { min-width: 0; flex: 1; resize: vertical; }
.chat-icon-button { width: 42px; height: 42px; flex: 0 0 42px; }
.chat-send-button { min-height: 42px; padding: 0 14px; }
.visually-hidden { position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
@media (max-width: 600px) {
  .judge { padding-inline: 0; }
  .chat-shell { width: 100%; min-height: calc(100dvh - 58px); }
  .chat-thread { max-height: calc(100dvh - 310px); }
  .chat-bubble { max-width: calc(100% - 76px); }
}
```

- [ ] **Step 6: Run build and E2E**

Run: `python build_site.py`

Expected: `dist/assets/` contains all five PNGs and `dist/interview-chat.js` exists.

Run: `.\.wrangler\e2e-venv\Scripts\python.exe test_location_e2e.py`

Expected: new chat structure and mobile layout assertions pass.

- [ ] **Step 7: Commit structure and assets**

```bash
git add index.html styles.css build_site.py assets test_location_e2e.py
git commit -m "feat: add responsive Yongge interview chat shell"
```

### Task 4: Wire Existing Interview Behavior Into Chat

**Files:**
- Modify: `app.js:17-42,919-967,1035-1175,1287-1360,2180-2241`
- Modify: `test_location_e2e.py`

**Interfaces:**
- Consumes: `YonggeInterviewChat` from Task 1.
- Produces: `renderInterviewChat()`, `appendChatQuestion(question, index)`, `appendChatAnswer(text, snapshot)`, `resetInterviewChat()`.
- Preserves: all existing server/local/demo branches.

- [ ] **Step 1: Add failing behavior assertions**

In `test_location_and_text_fallback`, assert:

```python
assistant_messages = page.locator('[data-chat-role="assistant"]')
user_messages = page.locator('[data-chat-role="user"]')
expect(assistant_messages).to_have_count(1)
expect(assistant_messages.first).to_contain_text("最想解决")

page.locator("#fallbackAnswer").fill("最近亏损，想先止损")
page.locator("#confirmAnswer").click()
expect(user_messages).to_have_count(1)
expect(user_messages.first).to_contain_text("最近亏损")
expect(assistant_messages).to_have_count(2)

page.locator("#previousQuestion").click()
expect(user_messages).to_have_count(0)
expect(assistant_messages).to_have_count(1)
```

In `test_subtitle_case_demo`, assert at least two assistant and user bubbles appeared before review by reading a retained `state.interview.chat.messages` snapshot after playback.

- [ ] **Step 2: Run E2E and verify RED**

Run: `.\.wrangler\e2e-venv\Scripts\python.exe test_location_e2e.py`

Expected: FAIL because no chat messages are rendered.

- [ ] **Step 3: Add chat state and rendering helpers**

Add to `state.interview`:

```js
chat: YonggeInterviewChat.createModel()
```

Add:

```js
const YONGGE_AVATARS = [
  "assets/yongge-main.png",
  "assets/yongge-collar.png",
  "assets/yongge-hands.png",
  "assets/yongge-point.png",
  "assets/yongge-think.png"
];

function renderInterviewChat() {
  $("interviewThread").innerHTML = state.interview.chat.messages.map((message) => {
    const avatar = message.role === "assistant"
      ? `<img class="chat-avatar" src="${YONGGE_AVATARS[message.avatarIndex % YONGGE_AVATARS.length]}" alt="">`
      : "";
    return `<article class="chat-message ${message.role}" data-chat-role="${message.role}" data-message-key="${escapeHtml(message.key)}">
      ${avatar}<div class="chat-bubble">${escapeHtml(message.text)}</div>
    </article>`;
  }).join("");
  $("interviewThread").scrollTop = $("interviewThread").scrollHeight;
}

function appendChatQuestion(question, index) {
  YonggeInterviewChat.append(state.interview.chat, {
    key: `question-${index}`,
    role: "assistant",
    text: question.text,
    questionIndex: index,
    avatarIndex: index
  });
  renderInterviewChat();
}

function appendChatAnswer(text, snapshot) {
  YonggeInterviewChat.append(state.interview.chat, {
    key: `answer-${snapshot.turnId}`,
    role: "user",
    text,
    questionIndex: snapshot.questionIndex,
    avatarIndex: 0
  });
  renderInterviewChat();
}

function resetInterviewChat() {
  state.interview.chat = YonggeInterviewChat.createModel();
  renderInterviewChat();
  $("chatProgress").textContent = "AI 开店诊断 · 0 个问题";
}
```

- [ ] **Step 4: Connect helpers to existing state transitions**

At the end of `askQuestion()`:

```js
appendChatQuestion(question, state.interview.questionIndex);
$("chatProgress").textContent = `AI 开店诊断 · ${current} 个问题`;
```

In `confirmAnswerDraft()`, add `questionIndex` to the snapshot and call `appendChatAnswer(text, snapshot)` only after rejecting empty or duplicate in-flight submissions.

In `goToPreviousQuestion()` before `askQuestion(previous, prevIndex)`:

```js
YonggeInterviewChat.rewind(state.interview.chat, prevIndex);
renderInterviewChat();
```

In the demo loop, call `appendChatAnswer(answer, { turnId: state.interview.turnId, questionIndex: index })` when the subtitle answer is accepted.

Call `resetInterviewChat()` before starting a fresh real or demo interview. In `resetFlow()`, recreate `state.interview.chat`, then call `renderInterviewChat()` and reset `chatProgress`.

Bind controls without changing business functions:

```js
$("interviewBack").addEventListener("click", () => {
  state.audio?.stop();
  stopRecognition();
  state.interview.active = false;
  setPanel("location");
});
$("voiceInputButton").addEventListener("click", () => {
  if (state.interview.mode === "local-speech") startRecognition();
  else $("fallbackAnswer").focus();
});
```

- [ ] **Step 5: Run unit and E2E tests**

Run: `node test_interview_chat.js`

Expected: PASS.

Run: `.\.wrangler\e2e-venv\Scripts\python.exe test_location_e2e.py`

Expected: real text fallback, previous-question rewind, preset answers, and local demo all pass with chat assertions.

- [ ] **Step 6: Commit behavior wiring**

```bash
git add app.js test_location_e2e.py
git commit -m "feat: connect chat UI to interview workflow"
```

### Task 5: Full Regression and Visual QA

**Files:**
- Modify: `design-qa.md`
- Create: `design-reference/yongge-chat-checks/chat-desktop.png`
- Create: `design-reference/yongge-chat-checks/chat-mobile.png`

**Interfaces:**
- Validates all outputs from Tasks 1–4.

- [ ] **Step 1: Run syntax, unit, and Worker tests**

Run:

```powershell
node --check app.js
node --check interview-chat.js
node test_interview_chat.js
$tests = @(
  'test_fact_store.js','test_decision_engine.js','test_interview_policy.js',
  'test_server_decision_adapter.mjs','test_stepfun_client.mjs',
  'test_dashscope_asr_client.mjs','test_dashscope_tts_client.mjs',
  'test_agent_orchestrator.js','test_worker_exports.mjs','test_worker.mjs'
)
foreach ($test in $tests) {
  node $test
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

Expected: every command exits `0`.

- [ ] **Step 2: Build and run browser E2E**

Run: `python build_site.py`

Expected: public artifact builds successfully.

Run: `.\.wrangler\e2e-venv\Scripts\python.exe test_location_e2e.py`

Expected: all E2E cases pass.

- [ ] **Step 3: Start Wrangler and test real clickable flows**

Run: `npx wrangler dev`

In the in-app browser:

1. Open `http://127.0.0.1:8787/`.
2. Click “开始店铺问诊” and verify `#judge`, location step visibility, and refresh recovery.
3. Return home, click “查看诊断示例”, and run the local demo through result.
4. Exercise one typed answer and one previous-question action.
5. Confirm no uncaught page errors.

- [ ] **Step 4: Capture desktop and mobile chat**

Capture the interview state at `1280x900` and `390x844` into:

```text
design-reference/yongge-chat-checks/chat-desktop.png
design-reference/yongge-chat-checks/chat-mobile.png
```

Compare with the supplied reference for left/right bubble hierarchy, warm brown chat surface, blue user replies, Yongge paper-cutout placement, and bottom composer ergonomics.

- [ ] **Step 5: Write and pass design QA**

Create `design-qa.md` with:

```markdown
# Yongge Chat Design QA

Source: codex-clipboard-396dabd7-46a2-4e55-a004-713475db2504.png
Desktop capture: design-reference/yongge-chat-checks/chat-desktop.png
Mobile capture: design-reference/yongge-chat-checks/chat-mobile.png

## Blocking checks

- [x] Both landing entry points are clickable and local.
- [x] Existing interview, review, analysis, and result flow remains connected.
- [x] Assistant and user messages are visually distinct.
- [x] Supplied Yongge assets render without broken images.
- [x] 390px viewport has no horizontal overflow or overlapping controls.
- [x] Demo completes without the retired external host.

final result: passed
```

If any P0, P1, or P2 difference is found, fix it and repeat Steps 2–5 before handoff.

- [ ] **Step 6: Check final diff**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only intentional source, test, asset, screenshot, and QA changes remain.

- [ ] **Step 7: Commit verification artifacts**

```bash
git add design-qa.md design-reference/yongge-chat-checks
git commit -m "test: verify Yongge chat diagnosis flow"
```
