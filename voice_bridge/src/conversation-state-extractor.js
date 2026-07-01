import { findDestinations, findPeople, findPrefs, parseDays, parseStartTime } from "./suzhou-lexicon.js";

const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

function getStateLlmConfig() {
  const apiKey = process.env.STATE_LLM_API_KEY || process.env.OPENAI_API_KEY || process.env.ARK_API_KEY || (process.env.VOLC_STATE_LLM === "1" ? process.env.VOLC_ACCESS_KEY : "") || "";
  const baseUrl = process.env.STATE_LLM_BASE_URL || process.env.OPENAI_BASE_URL || process.env.ARK_BASE_URL || (apiKey ? DEFAULT_ARK_BASE_URL : "");
  const model = process.env.STATE_LLM_MODEL || process.env.OPENAI_MODEL || process.env.ARK_MODEL || process.env.VOLC_STATE_MODEL || "doubao-seed-1-6-250615";
  return { apiKey, baseUrl, model };
}

export function hasStateLlmConfig() {
  const config = getStateLlmConfig();
  return Boolean(config.baseUrl && config.apiKey && config.model);
}

export async function extractConversationState({ previousDraft, conversation, latestText }) {
  const fallbackDraft = fallbackExtract(previousDraft, latestText);
  if (!hasStateLlmConfig()) {
    return { draft: fallbackDraft, source: "fallback" };
  }

  try {
    const llmDraft = await callStateLlm({ previousDraft, conversation, latestText });
    const merged = mergeDrafts(fallbackDraft, llmDraft);
    return { draft: merged, source: "llm" };
  } catch (error) {
    return { draft: fallbackDraft, source: "fallback", error: error.message || String(error) };
  }
}

async function callStateLlm({ previousDraft, conversation, latestText }) {
  const config = getStateLlmConfig();
  const endpoint = config.baseUrl.replace(/\/$/, "") + "/chat/completions";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: JSON.stringify({
            previousDraft,
            conversation,
            latestText,
          }),
        },
      ],
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`state llm failed: ${response.status} ${text.slice(0, 300)}`);
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const parsed = safeJson(content);
  if (!parsed || typeof parsed !== "object") throw new Error("state llm returned non-json content");
  return normalizeDraft(parsed.draft || parsed);
}

function buildSystemPrompt() {
  return `你是苏州旅游语音导游的“对话状态抽取器”。你的任务不是回答用户，而是把多轮对话总结成稳定 JSON。

重要原则：
1. 只根据用户真实表达和上下文更新状态，不要因为出现“第一天/第二天”就把总时长改成一天/两天。
2. “第一天/第二天/第三天”是 dayConstraints，不是 totalDays。只有用户明确说“总共/改成/只做/玩一天/三天路线”等，才更新 totalDays。
3. 如果用户只说“定制苏州三日游”，即使没有具体景点，也应 allowClassicRoute=true，destinations=[]，表示可以用系统推荐经典路线。
4. 如果用户说“这个规划可以/按这个/就这样”，表示 acceptedSuggestedRoute=true。
5. 如果用户说“11点到/十一点到”，startTime=11:00。若说“第一天11点到”，同时写入 dayConstraints[0].arrivalTime=11:00。
6. 如果用户说“第一天下午只安排景点/下午再玩”，dayConstraints[0].afternoonOnly=true。
7. 输出必须是 JSON，不要 Markdown，不要解释。

输出 schema：
{
  "intent": "route_collect" | "route_ready" | "smalltalk" | "spot_explain" | "nearby_food",
  "draft": {
    "destinations": ["景点名"],
    "prefs": ["亲子", "美食", "少走路", "园林", "文博", "拍照", "自然", "古镇水乡", "购物"],
    "days": "half_day" | "one_day" | "two_day" | "three_day" | "",
    "people": "老人" | "亲子家庭" | "情侣/夫妻" | "朋友同行" | "商务接待" | "一人旅行" | "",
    "startTime": "HH:MM" | "",
    "food": boolean,
    "foodArea": "",
    "allowClassicRoute": boolean,
    "acceptedSuggestedRoute": boolean,
    "preferLunchFirst": boolean,
    "day1AfternoonOnly": boolean,
    "dayConstraints": [{"day":1,"arrivalTime":"HH:MM","afternoonOnly":true,"lunch":"小吃/美食"}]
  }
}`;
}

export function fallbackExtract(previousDraft, text) {
  const next = cloneDraft(previousDraft);
  const value = String(text || "");
  findDestinations(value).forEach((name) => addUnique(next.destinations, name));
  findPrefs(value).forEach((pref) => addUnique(next.prefs, pref));
  const parsedDays = parseDays(value);
  if (parsedDays) next.days = parsedDays;
  const parsedTime = parseStartTime(value);
  if (parsedTime) next.startTime = parsedTime;
  const people = findPeople(value);
  if (people) next.people = people;
  if (/美食|小吃|吃|午餐|午饭|晚饭|晚餐/.test(value)) {
    next.food = true;
    addUnique(next.prefs, "美食");
  }
  if (/平江路/.test(value)) next.foodArea = "平江路";
  if (/观前街/.test(value)) next.foodArea = "观前街";
  if (/三天|3\s*天|三日|3\s*日|两天|2\s*天|一天|1\s*天|半天|路线|行程|旅游|定制/.test(value)) next.allowClassicRoute = true;
  if (/第一天|第1天/.test(value) && parsedTime) {
    next.dayConstraints = upsertDayConstraint(next.dayConstraints, 1, { arrivalTime: parsedTime });
  }
  if (/第一天|第1天/.test(value) && /下午/.test(value) && /景点|行程|安排|逛/.test(value)) {
    next.day1AfternoonOnly = true;
    next.dayConstraints = upsertDayConstraint(next.dayConstraints, 1, { afternoonOnly: true });
  }
  if (/中午|午餐|午饭/.test(value) && /小吃|美食|吃|餐厅/.test(value)) {
    next.preferLunchFirst = true;
    next.dayConstraints = upsertDayConstraint(next.dayConstraints, 1, { lunch: "小吃/美食" });
  }
  if (/可以|就这样|按这个|这个规划行|没问题|确认|确定|生成路线/.test(value)) next.acceptedSuggestedRoute = true;
  next.routeTurns = (next.routeTurns || 0) + 1;
  if (value && !next.notes.includes(value)) next.notes.push(value);
  return next;
}

function normalizeDraft(input = {}) {
  const draft = cloneDraft(input);
  draft.destinations = arrayOfStrings(input.destinations);
  draft.prefs = arrayOfStrings(input.prefs);
  draft.days = ["half_day", "one_day", "two_day", "three_day", ""].includes(input.days) ? input.days : "";
  draft.people = typeof input.people === "string" ? input.people : "";
  draft.startTime = typeof input.startTime === "string" ? input.startTime : "";
  draft.food = Boolean(input.food);
  draft.foodArea = typeof input.foodArea === "string" ? input.foodArea : "";
  draft.allowClassicRoute = Boolean(input.allowClassicRoute);
  draft.acceptedSuggestedRoute = Boolean(input.acceptedSuggestedRoute);
  draft.preferLunchFirst = Boolean(input.preferLunchFirst);
  draft.day1AfternoonOnly = Boolean(input.day1AfternoonOnly);
  draft.dayConstraints = Array.isArray(input.dayConstraints) ? input.dayConstraints.filter(Boolean) : [];
  return draft;
}

export function mergeDrafts(baseDraft, incomingDraft = {}) {
  const merged = cloneDraft(baseDraft);
  arrayOfStrings(incomingDraft.destinations).forEach((name) => addUnique(merged.destinations, name));
  arrayOfStrings(incomingDraft.prefs).forEach((pref) => addUnique(merged.prefs, pref));
  if (incomingDraft.days) merged.days = incomingDraft.days;
  if (incomingDraft.people) merged.people = incomingDraft.people;
  if (incomingDraft.startTime) merged.startTime = incomingDraft.startTime;
  if (incomingDraft.foodArea) merged.foodArea = incomingDraft.foodArea;
  merged.food = Boolean(merged.food || incomingDraft.food);
  merged.allowClassicRoute = Boolean(merged.allowClassicRoute || incomingDraft.allowClassicRoute);
  merged.acceptedSuggestedRoute = Boolean(merged.acceptedSuggestedRoute || incomingDraft.acceptedSuggestedRoute);
  merged.preferLunchFirst = Boolean(merged.preferLunchFirst || incomingDraft.preferLunchFirst);
  merged.day1AfternoonOnly = Boolean(merged.day1AfternoonOnly || incomingDraft.day1AfternoonOnly);
  (incomingDraft.dayConstraints || []).forEach((constraint) => {
    if (!constraint?.day) return;
    merged.dayConstraints = upsertDayConstraint(merged.dayConstraints, constraint.day, constraint);
  });
  arrayOfStrings(incomingDraft.notes).forEach((note) => addUnique(merged.notes, note));
  merged.routeTurns = Math.max(merged.routeTurns || 0, incomingDraft.routeTurns || 0);
  return merged;
}

function cloneDraft(draft = {}) {
  return {
    destinations: arrayOfStrings(draft.destinations),
    prefs: arrayOfStrings(draft.prefs),
    days: draft.days || "",
    people: draft.people || "",
    startTime: draft.startTime || "",
    food: Boolean(draft.food),
    foodArea: draft.foodArea || "",
    allowClassicRoute: Boolean(draft.allowClassicRoute),
    acceptedSuggestedRoute: Boolean(draft.acceptedSuggestedRoute),
    preferLunchFirst: Boolean(draft.preferLunchFirst),
    day1AfternoonOnly: Boolean(draft.day1AfternoonOnly),
    dayConstraints: Array.isArray(draft.dayConstraints) ? [...draft.dayConstraints] : [],
    currentRoute: draft.currentRoute || null,
    status: draft.status || "collecting",
    routeTurns: draft.routeTurns || 0,
    notes: arrayOfStrings(draft.notes),
  };
}

function upsertDayConstraint(list = [], day, patch) {
  const next = Array.isArray(list) ? [...list] : [];
  const index = next.findIndex((item) => item.day === day);
  if (index >= 0) next[index] = { ...next[index], ...patch, day };
  else next.push({ ...patch, day });
  return next;
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()) : [];
}

function addUnique(list, item) {
  if (item && !list.includes(item)) list.push(item);
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}
