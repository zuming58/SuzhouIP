import { findDestinations, findPrefs, isClosingRouteCue, isRouteRelated, parseDays } from "./suzhou-lexicon.js";

export function classifyMockIntent(query) {
  const text = String(query || "");

  if (isClosingRouteCue(text) && isRouteRelated(text)) {
    return { name: "route_ready", confidence: 0.9, params: { trigger: "closing_cue" } };
  }

  if (/附近|周边/.test(text) && /美食|小吃|吃|餐厅|午餐|晚饭/.test(text)) {
    return {
      name: "nearby_recommend",
      confidence: 0.9,
      params: { category: "food", currentLocation: text.includes("观前") ? "观前街" : "拙政园" },
    };
  }

  const knownSpotMatch = text.match(/(与谁同坐轩|远香堂|小飞虹|香洲)/);
  const destinationMatches = findDestinations(text);
  const scenicAreaMatch = destinationMatches[0] ? [destinationMatches[0]] : null;
  const explicitExplain = /(讲解|介绍|讲讲|播放讲解|景点故事|点位故事)/.test(text);
  if (explicitExplain && (knownSpotMatch || scenicAreaMatch || /景点|点位|导览|园林故事|这个地方|这里/.test(text))) {
    return {
      name: "spot_explain",
      confidence: knownSpotMatch || scenicAreaMatch ? 0.9 : 0.76,
      params: {
        scenicArea: scenicAreaMatch ? scenicAreaMatch[0] : "拙政园",
        spot: knownSpotMatch ? knownSpotMatch[0] : scenicAreaMatch ? scenicAreaMatch[0] : "拙政园",
      },
    };
  }

  if (isRouteRelated(text)) {
    const parsedDays = parseDays(text);
    const prefs = findPrefs(text);
    return {
      name: "route_collect",
      confidence: 0.86,
      params: { ...(parsedDays ? { days: parsedDays } : {}), prefs, destinations: findDestinations(text) },
    };
  }

  return { name: "smalltalk", confidence: 0.68, params: {} };
}

export function buildMockToolResult(intent) {
  if (intent.name === "generate_route") {
    return {
      id: "classic_half_day",
      title: "园林与古城轻松线",
      summary: "适合想少走路、看园林、顺路吃苏州小吃的游客。",
      preferences: ["半天", "园林", "美食", "少走路"],
      note: "从拙政园开始，中午接平江路美食，节奏轻松。",
      nodes: [
        {
          time: "09:30",
          title: "拙政园",
          description: "先看远香堂，再到与谁同坐轩听诗意讲解。",
          action: { label: "开始导览", screen: "guide" },
        },
        {
          time: "12:00",
          title: "平江路",
          description: "推荐苏式汤面、桂花糖粥，适合慢慢逛。",
          action: { label: "查看推荐", screen: "nearby" },
        },
        {
          time: "14:00",
          title: "评弹茶馆",
          description: "坐下来听一段江南声音，作为轻松收尾。",
          action: { label: "加入行程", screen: "trip" },
        },
      ],
    };
  }

  if (intent.name === "spot_explain") {
    const text =
      intent.params.spot === "小飞虹"
        ? "小飞虹像一笔轻轻架在水面上的桥，走过它时，水、廊、亭会一层层换景。"
        : intent.params.spot === "远香堂"
          ? "远香堂取“香远益清”之意，是拙政园中部看水面与荷风的核心点。"
          : "与谁同坐轩出自苏东坡的词，“与谁同坐？明月、清风、我。”它把诗意藏进扇形空间里。";
    return { spot: intent.params.spot, text };
  }

  if (intent.name === "nearby_recommend") {
    return {
      title: "拙政园附近苏州小吃",
      location: "平江路",
      items: [
        { title: "苏式汤面", description: "清汤细面，适合作为轻松午餐。", time: "12:10" },
        { title: "桂花糖粥", description: "甜口小食，边走边吃很有苏州味。", time: "12:45" },
        { title: "评弹茶馆", description: "吃完后坐一会儿，接江南文化体验。", time: "13:30" },
      ],
    };
  }

  return null;
}

export function buildMockReply(intent, result) {
  if (intent.name === "generate_route") {
    return `好，我先帮你排一条轻松半天线：${result.title}。上午从拙政园开始，中午接到平江路吃苏州小吃，最后可以坐下来听一段评弹。`;
  }
  if (intent.name === "spot_explain") return result.text;
  if (intent.name === "nearby_recommend") {
    return `附近我推荐去${result.location}。可以先吃苏式汤面，再尝桂花糖粥，时间宽松的话，去评弹茶馆坐一会儿，很有苏州味。`;
  }
  return "可以呀。我是苏丽娘，你可以问我路线、园林故事、附近美食，或者让我把讲解说得更诗意一点。";
}

export function classifyIntent(query) {
  return classifyMockIntent(query);
}

export async function callTool(intent) {
  if (intent.name === "generate_route") {
    return generateRoute(intent.params);
  }
  if (intent.name === "spot_explain") {
    return explainSpot(intent.params);
  }
  if (intent.name === "nearby_recommend") {
    return recommendNearby(intent.params);
  }
  return null;
}
