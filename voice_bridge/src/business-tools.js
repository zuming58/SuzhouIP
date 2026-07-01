import { findDestinationMeta, parseStartTime } from "./suzhou-lexicon.js";

export const businessData = {
  routes: [
    {
      id: "garden-food",
      title: "园林与古城轻松线",
      summary: "少走路、重体验，适合半天到一天的比赛演示主线。",
      preferences: ["半天", "园林", "美食", "少走路"],
      note: "带老人，想轻松一点，中午想吃苏州小吃。",
      nodes: [
        {
          time: "09:30",
          title: "拙政园",
          description: "苏州园林代表，内置精讲样板。",
          action: { label: "开始导览", screen: "guide" },
        },
        {
          time: "12:00",
          title: "平江路",
          description: "小吃、咖啡、老街散步。",
          action: { label: "查看推荐", screen: "nearby" },
        },
        {
          time: "15:00",
          title: "虎丘",
          description: "历史遗迹，作为可扩展示例。",
          action: { label: "查看介绍", video: "speaking_loop.mp4" },
        },
      ],
    },
    {
      id: "one-day-classic",
      title: "苏州经典一日游",
      summary: "涵盖苏州最精华的园林、水乡和人文体验。",
      preferences: ["一天", "园林", "水乡", "人文"],
      note: "适合第一次来苏州，想全面体验的游客。",
      nodes: [
        {
          time: "09:00",
          title: "拙政园",
          description: "中国四大名园之首，苏州必看。",
          action: { label: "开始导览", screen: "guide" },
        },
        {
          time: "11:30",
          title: "苏州博物馆",
          description: "贝聿铭设计，建筑本身就是艺术品。",
          action: { label: "查看介绍", screen: "spot" },
        },
        {
          time: "14:00",
          title: "平江路",
          description: "古城水巷，适合散步和吃小吃。",
          action: { label: "查看推荐", screen: "nearby" },
        },
        {
          time: "16:30",
          title: "山塘街",
          description: "七里山塘，最有代表性的苏州水乡。",
          action: { label: "加入行程", screen: "trip" },
        },
      ],
    },
  ],
  spots: [
    {
      id: "yuanxiang",
      name: "远香堂",
      scenicArea: "拙政园",
      summary: "拙政园中部主厅，适合讲荷风、借景和园林开合。",
      story: "远香堂取周敦颐《爱莲说》“香远益清”之意。站在这里看水面、荷风和四面景窗，能感到园林把诗句变成了空间。",
    },
    {
      id: "yushui",
      name: "与谁同坐轩",
      scenicArea: "拙政园",
      summary: "扇形小轩，是最适合苏丽娘诗意讲解的点位。",
      story: "这座扇形小轩，名字出自苏东坡的词：“与谁同坐？明月、清风、我。”窗、梁、石凳都呼应扇面，像把清风明月收进园中。",
    },
    {
      id: "xiaofeihong",
      name: "小飞虹",
      scenicArea: "拙政园",
      summary: "水院中的廊桥，适合讲一步一景和园林动线。",
      story: "小飞虹像一笔轻轻架在水面上的桥。走过它时，视线会从水、廊、亭之间转换，这就是苏州园林最会安排的“移步换景”。",
    },
    {
      id: "xiangzhou",
      name: "香洲",
      scenicArea: "拙政园",
      summary: "船舫形建筑，适合连接水乡意象。",
      story: "香洲像一艘停在园中的船。它不是真的要远行，而是让人坐在园里，也能想象江南水路和荷香风动。",
    },
  ],
  nearby: [
    {
      id: "pingjiang-food",
      category: "午餐建议",
      title: "平江路小吃慢逛",
      location: "平江路",
      description: "适合从拙政园出来后步行或短途打车过去。",
      items: [
        { title: "苏式汤面", description: "清汤细面，适合轻松午餐。", time: "12:10" },
        { title: "桂花糖粥", description: "甜口小食，适合边逛边吃。", time: "12:45" },
        { title: "评弹茶馆", description: "可作为昆曲、江南文化延展体验。", time: "13:30" },
      ],
    },
    {
      id: "guanqian-food",
      category: "商圈美食",
      title: "观前街商圈",
      location: "观前街",
      description: "苏州最繁华的商圈，老字号集中。",
      items: [
        { title: "松鼠桂鱼", description: "苏州名菜，外酥里嫩，酸甜适口。", time: "12:00" },
        { title: "响油鳝糊", description: "经典苏帮菜，上桌时热油还在滋滋作响。", time: "12:20" },
        { title: "枣泥拉糕", description: "饭后甜点，软糯香甜。", time: "13:00" },
      ],
    },
  ],
};

// 苏州特色美食数据库
const suzhouFoodDatabase = {
  "平江路": [
    { name: "桃花源记", specialty: "赤豆小圆子、酱方、松鼠桂鱼", type: "苏帮菜老字号" },
    { name: "鱼食饭稻", specialty: "响油鳝糊、清炒河虾仁", type: "创意苏帮菜" },
    { name: "潘玉麟糖粥", specialty: "桂花糖粥、小圆子", type: "网红小吃" },
    { name: "皇城秘制鸡爪", specialty: "酱鸡爪、卤味", type: "街边小吃" },
  ],
  "观前街": [
    { name: "得月楼", specialty: "松鼠桂鱼、响油鳝糊、苏式船点", type: "苏帮菜顶级老字号" },
    { name: "松鹤楼", specialty: "松鼠桂鱼、碧螺虾仁、莼菜汤", type: "百年苏帮菜老字号" },
    { name: "黄天源", specialty: "糕团、薄荷糕、玫瑰糕", type: "糕团老字号" },
    { name: "陆长兴", specialty: "苏式汤面、爆鱼面、焖肉面", type: "面馆老字号" },
  ],
  "山塘街": [
    { name: "大阿二生煎", specialty: "生煎包、蟹壳黄", type: "生煎老字号" },
    { name: "赵元章肉骨烧", specialty: "酱排骨、肉骨头", type: "卤味老字号" },
    { name: "荣阳楼", specialty: "油氽团子、汤包", type: "点心老字号" },
  ],
  "拙政园": [
    { name: "平江路桃花源记", specialty: "赤豆小圆子、松鼠桂鱼", type: "步行5分钟可达" },
    { name: "吴门人家", specialty: "苏州官府菜、糖粥", type: "步行10分钟可达" },
  ],
  "虎丘": [
    { name: "虎丘山庄", specialty: "素面、苏帮菜", type: "景区内餐厅" },
    { name: "山塘街大阿二生煎", specialty: "生煎包", type: "打车10分钟可达" },
  ],
  "苏州博物馆": [
    { name: "平江路鱼食饭稻", specialty: "响油鳝糊", type: "步行8分钟可达" },
    { name: "拙政园附近吴门人家", specialty: "官府菜", type: "步行10分钟可达" },
  ],
};

// 根据位置推荐附近美食
function recommendNearbyFood(area, timeOfDay = "lunch") {
  const restaurants = suzhouFoodDatabase[area] || suzhouFoodDatabase["平江路"];
  const selected = restaurants[Math.floor(Math.random() * restaurants.length)];
  const mealLabel = timeOfDay === "dinner" ? "晚餐推荐" : "午餐推荐";
  return {
    title: `${mealLabel} · ${selected.name}`,
    description: `${selected.type}，特色：${selected.specialty}`,
    action: { label: "查看更多", screen: "nearby" },
  };
}

// 解析时间字符串为分钟数，用于比较排序
function parseTimeToMinutes(timeStr) {
  const clean = timeStr.replace(/^D\d+\s*/, ""); // 去掉 D1 D2 前缀
  const [hour, minute] = clean.split(":").map(Number);
  return hour * 60 + (minute || 0);
}

// 判断某个时间点是否应该插入餐饮
function shouldInsertMeal(nodeTime, lastMealTime, hasFoodPref) {
  if (!hasFoodPref) return null;
  const mins = parseTimeToMinutes(nodeTime);
  const lastMins = lastMealTime ? parseTimeToMinutes(lastMealTime) : 0;
  // 午餐窗口：11:30-13:00，且距离上一餐超过3小时
  if (mins >= 690 && mins <= 780 && mins - lastMins > 180) return "lunch";
  // 晚餐窗口：17:30-19:00，且距离上一餐超过4小时
  if (mins >= 1050 && mins <= 1140 && mins - lastMins > 240) return "dinner";
  return null;
}

export function generateRoute(params = {}) {
  const draft = params.draft || params;
  let destinations = normalizeDestinations(draft.destinations || []);
  const prefs = draft.prefs || params.prefs || [];
  const days = draft.days || params.days || "half_day";
  const startTime = resolveStartTime(draft, days);
  if (!destinations.length) destinations = defaultDestinationsForDuration(days, prefs, draft);

  const timeSlots = buildTimeSlots(days, startTime, draft);
  const itineraryDestinations = expandDestinationsForDuration(destinations, days, prefs, draft);
  let nodes = buildRouteNodes(itineraryDestinations, timeSlots, prefs, draft);

  // 放宽美食关键词匹配
  const hasFoodPreference = prefs.some((p) => /美食|吃|小吃|饭|午餐|晚餐|吃饭|吃点|好吃|餐厅|饭馆/.test(p)) || draft.food;

  if (hasFoodPreference) {
    // 按时间智能插入午餐/晚餐节点，而不是简单加到最后
    const finalNodes = [];
    let lastMealTime = null;
    const foodArea = draft.foodArea || destinations.find((d) => suzhouFoodDatabase[d]) || "平江路";

    for (const node of nodes) {
      // 检查这个节点之前是否应该插入餐饮
      const mealType = shouldInsertMeal(node.time, lastMealTime, hasFoodPreference);
      if (mealType) {
        const foodNode = {
          time: node.time,
          ...recommendNearbyFood(foodArea, mealType),
        };
        finalNodes.push(foodNode);
        lastMealTime = node.time;
        // 把原景点时间往后推半小时
        const nodeMins = parseTimeToMinutes(node.time);
        const newMins = nodeMins + 60; // 吃饭留1小时
        const newHour = Math.floor(newMins / 60);
        const newMinute = newMins % 60;
        node.time = `${String(newHour).padStart(2, "0")}:${String(newMinute).padStart(2, "0")}`;
      }
      finalNodes.push(node);
    }

    // 如果所有景点都太早，午餐还没机会插入，就加到中间
    if (!lastMealTime && days !== "half_day") {
      const midIndex = Math.floor(finalNodes.length / 2);
      const foodNode = {
        time: "12:00",
        ...recommendNearbyFood(foodArea, "lunch"),
      };
      finalNodes.splice(midIndex, 0, foodNode);
    }

    nodes = finalNodes;
  }

  return {
    id: "conversation-custom-route",
    title: buildRouteTitle(destinations, days),
    summary: buildRouteSummary(draft, prefs),
    preferences: buildPreferenceLabels(draft, prefs, days),
    note: buildRouteNote(draft, destinations),
    nodes,
    finalized: true,
    draft,
  };
}

function normalizeDestinations(destinations) {
  const seen = new Set();
  return destinations
    .filter(Boolean)
    .map((item) => String(item).trim())
    .filter((item) => item && !seen.has(item) && seen.add(item));
}

function resolveStartTime(draft, days) {
  if (draft.startTime) return draft.startTime;
  const fromNotes = (draft.notes || []).map((note) => parseStartTime(note)).find(Boolean);
  return fromNotes || defaultStartTime(days);
}

function buildTimeSlots(days, startTime, draft = {}) {
  if (draft.day1AfternoonOnly || draft.preferLunchFirst) {
    if (days === "three_day") return ["D1 12:00", "D1 13:30", "D1 15:30", "D2 09:30", "D2 12:30", "D2 15:30", "D3 09:30", "D3 12:30", "D3 15:00"];
    if (days === "two_day") return ["D1 12:00", "D1 13:30", "D1 15:30", "D2 09:30", "D2 12:30", "D2 15:30"];
    if (days === "one_day") return ["12:00", "13:30", "15:30", "17:00"];
  }
  if (days === "three_day") return ["D1 " + startTime, "D1 12:30", "D1 15:30", "D2 09:30", "D2 12:30", "D2 15:30", "D3 09:30", "D3 12:30", "D3 15:00"];
  if (days === "two_day") return ["D1 " + startTime, "D1 12:30", "D1 15:30", "D2 09:30", "D2 12:30", "D2 15:30"];
  if (days === "one_day") return [startTime, "11:30", "13:30", "15:30", "17:00"];
  return [startTime, "11:00", "12:30", "14:00"];
}

function buildRouteNodes(destinations, timeSlots, prefs, draft = {}) {
  const ordered = [...destinations];
  if (draft.preferLunchFirst) {
    const foodTitle = draft.foodArea || "平江路";
    const withoutFood = ordered.filter((title) => title !== foodTitle);
    ordered.length = 0;
    ordered.push(foodTitle, ...withoutFood);
  }
  return ordered.slice(0, timeSlots.length).map((title, index) => ({
    time: timeSlots[index] || "15:00",
    title,
    description: describeDestination(title, prefs),
    action: /平江路|观前街/.test(title)
      ? { label: "查看推荐", screen: "nearby" }
      : { label: "查看介绍", screen: "spot", spotTitle: title },
  }));
}

function defaultStartTime(days) {
  return days === "half_day" ? "09:30" : "09:00";
}

function defaultDestinationsForDuration(days, prefs = [], draft = {}) {
  if (prefs.includes("亲子")) {
    if (days === "three_day") return ["拙政园", "苏州博物馆", "平江路", "苏州乐园", "金鸡湖", "诚品书店", "太湖湿地公园", "山塘街"];
    if (days === "two_day") return ["拙政园", "平江路", "苏州乐园", "金鸡湖", "苏州博物馆", "山塘街"];
    return ["拙政园", "苏州博物馆", "平江路", "金鸡湖"];
  }
  if (prefs.includes("购物")) {
    return days === "half_day" ? ["苏州中心", "金鸡湖", "诚品书店"] : ["苏州中心", "金鸡湖", "诚品书店", "观前街", "平江路"];
  }
  if (days === "three_day") return ["拙政园", "苏州博物馆", "平江路", "虎丘", "山塘街", "金鸡湖", "同里古镇", "太湖"];
  if (days === "two_day") return ["拙政园", "苏州博物馆", "平江路", "虎丘", "山塘街", "金鸡湖"];
  if (days === "one_day") return ["拙政园", "苏州博物馆", "平江路", "山塘街", "金鸡湖"];
  return ["拙政园", "苏州博物馆", draft.foodArea || "平江路"];
}

function expandDestinationsForDuration(destinations, days, prefs, draft) {
  const result = [...destinations];
  const add = (name) => {
    if (!result.includes(name)) result.push(name);
  };
  const hasFoodPreference = prefs.some((p) => /美食|吃|小吃|饭|午餐|晚餐|吃饭|吃点|好吃|餐厅|饭馆/.test(p)) || draft.food;
  if (hasFoodPreference) add(draft.foodArea || "平江路");
  if (days === "one_day" && result.length < 4) {
    add("苏州博物馆");
    add("平江路");
    add("山塘街");
  }
  if (days === "two_day" && result.length < 6) {
    add("苏州博物馆");
    add("平江路");
    add("金鸡湖");
    add("虎丘");
    add("山塘街");
  }
  if (days === "three_day" && result.length < 8) {
    add("苏州博物馆");
    add("平江路");
    add("金鸡湖");
    add("虎丘");
    add("山塘街");
    add("同里古镇");
    add("太湖");
  }
  return result;
}

function describeDestination(title, prefs = []) {
  if (title.includes("拙政园")) return "苏州园林代表，适合从远香堂、与谁同坐轩、小飞虹展开精讲。";
  if (title.includes("苏州博物馆")) return "贝聿铭设计的苏州文化名片，适合建筑与文物一起讲。";
  if (title.includes("平江路")) return "古城水巷和苏州小吃集中，适合慢逛补给。";
  if (title.includes("虎丘")) return "苏州历史地标，可讲虎丘塔、吴文化和城市记忆。";
  if (title.includes("山塘街")) return "七里山塘水街，适合傍晚体验江南街巷。";
  if (title.includes("观前街")) return "老字号和苏帮菜集中，适合安排午餐或晚餐。";
  const meta = findDestinationMeta(title);
  if (meta) return `${title}属于${meta.category}类目的苏州文旅点，适合结合${meta.tags.slice(0, 3).join("、")}来安排行程。`;
  if (prefs.includes("亲子")) return `${title}适合做轻松讲解和互动打卡。`;
  return `${title}已加入你的定制路线，后续可生成专属讲解。`;
}

function buildRouteTitle(destinations, days) {
  const dayLabel = days === "three_day" ? "三日" : days === "two_day" ? "两日" : days === "one_day" ? "一日" : "半日";
  if (destinations.includes("拙政园") && destinations.some((item) => /平江路|观前街/.test(item))) return `拙政园与苏州味${dayLabel}线`;
  return `${destinations[0]}${destinations.length > 1 ? "等" : ""}${dayLabel}定制线`;
}

function buildRouteSummary(draft, prefs) {
  const parts = [];
  if (draft.people) parts.push(`适合${draft.people}`);
  if (prefs.includes("少走路")) parts.push("少走路、节奏轻松");
  if (prefs.includes("美食") || draft.food) parts.push("串联苏州小吃");
  if (!parts.length) parts.push("根据刚才对话生成");
  return `${parts.join("，")}的定制路线。`;
}

function buildPreferenceLabels(draft, prefs, days) {
  const labels = [days === "three_day" ? "三天" : days === "two_day" ? "两天" : days === "one_day" ? "一天" : "半天", ...prefs];
  if (draft.people) labels.push(draft.people);
  return [...new Set(labels.filter(Boolean))];
}

function buildRouteNote(draft, destinations) {
  const details = [];
  if (destinations.length) details.push(`想去：${destinations.join("、")}`);
  const noteStartTime = draft.startTime || (draft.notes || []).map((note) => parseStartTime(note)).find(Boolean);
  if (noteStartTime) details.push(`出发/到达：${noteStartTime}`);
  if (draft.people) details.push(`同行：${draft.people}`);
  if (draft.food) details.push("需要安排美食");
  return details.length ? details.join("；") : "根据刚才的多轮对话生成，可继续调整。";
}

export function explainSpot(params = {}) {
  const { spot = "与谁同坐轩", scenicArea = "拙政园" } = params;
  const found = businessData.spots.find(
    (s) => s.name.includes(spot) || spot.includes(s.name) || s.id.includes(spot)
  );
  if (found) return found;
  return {
    spot: spot,
    scenicArea: scenicArea,
    text: `${spot}是${scenicArea}的重要景点，具有独特的园林美学价值。`,
  };
}

export function recommendNearby(params = {}) {
  const { category = "food", currentLocation = "拙政园" } = params;
  if (currentLocation.includes("观前街") || currentLocation.includes("商圈")) {
    return businessData.nearby[1];
  }
  return businessData.nearby[0];
}

export function buildVoiceReply(intentName, toolResult) {
  if (intentName === "generate_route" || intentName === "finalize_route") {
    return `好，我先帮你排一条${toolResult.preferences.join("、")}的${toolResult.title}。${toolResult.nodes.map((n) => `${n.time}到${n.title}`).join("，")}。整体${toolResult.summary}`;
  }
  if (intentName === "spot_explain") {
    return toolResult.story || toolResult.text || `${toolResult.name}是${toolResult.scenicArea}的精华点位。${toolResult.summary}`;
  }
  if (intentName === "nearby_recommend") {
    return `附近我推荐去${toolResult.location}。${toolResult.items.slice(0, 2).map((i) => i.title).join("，")}都是不错的选择。`;
  }
  return null;
}
