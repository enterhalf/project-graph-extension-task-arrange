/**
 * OKK，ERR，TRR
 */

// --- constants ---

const DELAY_KEYWORDS = ["搁置", "delay", "@de"];

let sequentialThresholdDeg = 6;
let SEQUENTIAL_THRESHOLD = Math.tan(6 * Math.PI / 180);

const COLOR_ACTIVATE = { _: "Color", r: 254, g: 123, b: 1 };
const COLOR_DELAY = { _: "Color", r: 234, g: 179, b: 8 };
const COLOR_DELAY_DEEP = { _: "Color", r: 68, g: 38, b: 7 };

const DATE_TODAY      = { _: "Color", r: 255, g: 255, b: 255 };
const DATE_TOMORROW   = { _: "Color", r: 214, g: 188, b: 250 };
const DATE_DAY_AFTER  = { _: "Color", r: 183, g: 148, b: 244 };
const DATE_WEEK       = { _: "Color", r: 159, g: 103, b: 255 };
const DATE_TWO_WEEKS  = { _: "Color", r: 124, g: 58,  b: 237 };
const DATE_FOUR_WEEKS = { _: "Color", r: 107, g: 33,  b: 168 };
const DATE_FURTHER    = { _: "Color", r: 74,  g: 0,   b: 128 };

const DATE_PLACEHOLDER_RE = /⏳\s*-?\d+天\s*/g;

// --- helpers ---

function isDelayed(text) {
  const lower = text.toLowerCase();
  return DELAY_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

function isCompleted(text) {
  return text.startsWith("✅ ") || text.startsWith("❌ ");
}

function parseDates(text) {
  const results = [];
  const patterns = [
    { re: /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g, hasYear: true },
    { re: /(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/g, hasYear: true },
    { re: /(\d{2})-(\d{1,2})-(\d{1,2})(?!\d)/g, hasYear: true, shortYear: true },
    { re: /(\d{1,2})\s*月\s*(\d{1,2})\s*日/g, hasYear: false },
    { re: /(?<!\d)(\d{1,2})-(\d{1,2})(?!\d)/g, hasYear: false },
  ];
  const currentYear = new Date().getFullYear();
  const covered = [];

  function isCovered(start, end) {
    return covered.some(([s, e]) => start < e && end > s);
  }

  for (const { re, hasYear, shortYear } of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const mStart = m.index;
      const mEnd = m.index + m[0].length;
      if (isCovered(mStart, mEnd)) continue;
      let year, month, day;
      if (hasYear) {
        year = parseInt(m[1], 10);
        if (shortYear) year += 2000;
        month = parseInt(m[2], 10);
        day = parseInt(m[3], 10);
      } else {
        year = currentYear;
        month = parseInt(m[1], 10);
        day = parseInt(m[2], 10);
      }
      if (month < 1 || month > 12 || day < 1 || day > 31) continue;
      covered.push([mStart, mEnd]);
      results.push({ year, month, day, match: m[0], index: m.index });
    }
  }

  results.sort((a, b) => a.index - b.index);
  return results;
}

function daysFromToday(year, month, day) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(year, month - 1, day);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function getPurpleColor(days) {
  if (days <= 0) return DATE_TODAY;
  if (days === 1) return DATE_TOMORROW;
  if (days === 2) return DATE_DAY_AFTER;
  if (days <= 7) return DATE_WEEK;
  if (days <= 14) return DATE_TWO_WEEKS;
  if (days <= 28) return DATE_FOUR_WEEKS;
  return DATE_FURTHER;
}

function stripDateMarking(text) {
  if (!DATE_PLACEHOLDER_RE.test(text)) return text;
  return text.replace(DATE_PLACEHOLDER_RE, "").trim();
}

function addDatePrefix(cleanText, daysLeft) {
  const prefixMatch = cleanText.match(/^((?:✅ |❌ )?(?:🛠️ )?(?:📌 )?)/);
  const prefix = prefixMatch ? prefixMatch[1] : "";
  const content = cleanText.slice(prefix.length);
  return `${prefix}⏳ ${daysLeft}天 ${content}`.replace(/天\s{2,}/, "天 ");
}

function getEdgeType(sY, sX, tY, tX) {
  const dx = tX - sX;
  const dy = tY - sY;
  if (Math.abs(dy) >= Math.abs(dx) * SEQUENTIAL_THRESHOLD) return "parent-child";
  return "sequential";
}

async function buildGraphData() {
  // 从设置读取角度阈值（用户可在扩展设置页修改）
  const saved = await prg.settings_getOwn("sequentialThresholdDeg");
  if (saved != null) {
    const deg = parseFloat(saved);
    if (!isNaN(deg) && deg > 0 && deg < 90) {
      SEQUENTIAL_THRESHOLD = Math.tan(deg * Math.PI / 180);
    }
  }

  const project = await prg.tabs_getCurrentProject();
  const stageManager = await project.stageManager;
  const allTextNodes = await stageManager.getTextNodes();
  const allEdges = await stageManager.getEdges();

  const entityMap = {};
  for (const ent of allTextNodes) {
    try {
      const uuid = await ent.uuid;
      const text = await ent.text;
      const geom = await ent.geometryCenter;
      const gx = await geom.x;
      const gy = await geom.y;
      if (uuid) entityMap[uuid] = { entity: ent, text, x: gx, y: gy, uuid };
    } catch (_) {
      /* skip entities without expected properties */
    }
  }

  const edgeList = [];
  for (const edge of allEdges) {
    try {
      const src = await edge.source;
      const tgt = await edge.target;
      const sUuid = await src.uuid;
      const tUuid = await tgt.uuid;
      const sData = entityMap[sUuid];
      const tData = entityMap[tUuid];
      if (!sData || !tData) continue;
      const type = getEdgeType(sData.y, sData.x, tData.y, tData.x);
      if (type) edgeList.push({ sUuid, tUuid, type, edge });
    } catch (_) {
      /* skip malformed edges */
    }
  }

  const children = {};
  const seqNext = {};
  const seqPrev = {};
  for (const e of edgeList) {
    if (e.type === "parent-child") {
      (children[e.sUuid] = children[e.sUuid] || []).push(e.tUuid);
    } else if (e.type === "sequential") {
      (seqNext[e.sUuid] = seqNext[e.sUuid] || []).push(e.tUuid);
      (seqPrev[e.tUuid] = seqPrev[e.tUuid] || []).push(e.sUuid);
    }
  }

  return { entityMap, children, seqNext, seqPrev, edgeList };
}

function isSeqChainComplete(uuid, completedSet, data, visited) {
  if (!completedSet.has(uuid)) return false;
  if (visited.has(uuid)) return true;
  visited.add(uuid);
  for (const next of (data.seqNext[uuid] || [])) {
    if (!isSeqChainComplete(next, completedSet, data, visited)) return false;
  }
  return true;
}

function findReadyNodes(rootUuid, data, completedSet) {
  const { entityMap, children, seqNext, seqPrev } = data;
  const results = [];
  const visited = new Set();

  function dfs(nodeUuid) {
    if (visited.has(nodeUuid)) return;
    visited.add(nodeUuid);

    const childList = (children[nodeUuid] || [])
      .slice()
      .sort((a, b) => entityMap[a].x - entityMap[b].x);
    for (const childUuid of childList) {
      dfs(childUuid);
    }

    if (!completedSet.has(nodeUuid)) {
      const allChildrenDone = (children[nodeUuid] || []).every(
        (c) => isSeqChainComplete(c, completedSet, data, new Set()),
      );
      const allSeqDone = (seqPrev[nodeUuid] || []).every(
        (p) => completedSet.has(p),
      );
      if (allChildrenDone && allSeqDone) {
        results.push(nodeUuid);
      }
    }

    if (completedSet.has(nodeUuid)) {
      const seqList = (seqNext[nodeUuid] || [])
        .slice()
        .sort((a, b) => entityMap[a].x - entityMap[b].x);
      for (const seqUuid of seqList) {
        dfs(seqUuid);
      }
    }
  }

  dfs(rootUuid);
  return results;
}

function getDfsOrder(rootUuid, data, completedSet) {
  const { entityMap, children, seqNext } = data;
  const order = [];
  const visited = new Set();

  function dfs(uuid) {
    if (visited.has(uuid)) return;
    visited.add(uuid);
    order.push(uuid);

    const childList = (children[uuid] || [])
      .slice()
      .sort((a, b) => (entityMap[a]?.x ?? 0) - (entityMap[b]?.x ?? 0));
    for (const child of childList) {
      dfs(child);
    }

    // 在已完成节点处，继续进入 seqNext（和 findReadyNodes 行为一致）
    if (completedSet.has(uuid)) {
      const seqList = (seqNext[uuid] || [])
        .slice()
        .sort((a, b) => (entityMap[a]?.x ?? 0) - (entityMap[b]?.x ?? 0));
      for (const seq of seqList) {
        dfs(seq);
      }
    }
  }

  dfs(rootUuid);
  return order;
}

function findParent(uuid, data) {
  const { children } = data;
  for (const [parent, kids] of Object.entries(children)) {
    if (kids.includes(uuid)) return parent;
  }
  return null;
}

function findRoot(nodeUuid, data) {
  const { children, seqNext } = data;
  const parents = {};
  for (const [s, tList] of Object.entries(children)) {
    for (const t of tList) {
      (parents[t] = parents[t] || []).push(s);
    }
  }
  for (const [s, tList] of Object.entries(seqNext)) {
    for (const t of tList) {
      (parents[t] = parents[t] || []).push(s);
    }
  }

  const visited = new Set();
  let current = nodeUuid;
  while (current && !visited.has(current)) {
    visited.add(current);
    const up = parents[current];
    if (!up || up.length === 0) break;
    const sorted = up.sort(
      (a, b) =>
        (data.entityMap[a]?.x ?? 0) - (data.entityMap[b]?.x ?? 0),
    );
    current = sorted[0];
  }
  return current;
}

function getBaseName(text) {
  return text
    .replace(/^✅\s*/, "")
    .replace(/^❌\s*/, "")
    .replace(/^🛠️\s*/, "")
    .replace(/^📌\s*/, "")
    .replace(DATE_PLACEHOLDER_RE, "")
    .trim();
}

function removePin(text) {
  return text.replace(/📌\s*/, "").trim();
}

async function processDateMarkings(entityMap) {
  for (const [uuid, info] of Object.entries(entityMap)) {
    const rawText = info.text;
    if (!rawText) continue;

    const cleanText = stripDateMarking(rawText);
    const dates = parseDates(cleanText);
    const isHighlighted = cleanText.includes("📌");
    const isStatus = cleanText.startsWith("✅ ") || cleanText.startsWith("❌ ");
    const isRoot = cleanText.includes("🛠️");

    if (dates.length === 0) {
      if (cleanText !== rawText) {
        await info.entity.rename(cleanText);
        info.text = cleanText;
        if (!isStatus && !isRoot && !isHighlighted) {
          info.entity.color = { _: "Color", r: 0, g: 0, b: 0, a: 0 };
        }
      }
      continue;
    }

    const delayed = isDelayed(cleanText);
    const has2 = dates.length >= 2;
    const startDate = has2 ? dates[0] : null;
    const deadline = has2 ? dates[1] : dates[0];

    if (delayed && !has2) {
      const startDays = daysFromToday(deadline.year, deadline.month, deadline.day);
      const hasStarted = startDays <= 0;
      if (cleanText !== rawText) {
        await info.entity.rename(cleanText);
        info.text = cleanText;
      }
      if (hasStarted && isHighlighted) {
        info.entity.color = COLOR_ACTIVATE;
      } else if (!isStatus && !isRoot && !isHighlighted) {
        info.entity.color = { _: "Color", r: 0, g: 0, b: 0, a: 0 };
      }
      continue;
    }

    if (isStatus || isRoot) {
      const daysLeft = daysFromToday(deadline.year, deadline.month, deadline.day);
      const newText = addDatePrefix(cleanText, daysLeft);
      if (newText !== info.text) {
        await info.entity.rename(newText);
        info.text = newText;
      }
      continue;
    }

    const daysLeft = daysFromToday(deadline.year, deadline.month, deadline.day);
    let hasStarted = true;
    if (startDate) {
      hasStarted = daysFromToday(startDate.year, startDate.month, startDate.day) <= 0;
    }

    const newText = addDatePrefix(cleanText, daysLeft);
    if (newText !== info.text) {
      await info.entity.rename(newText);
      info.text = newText;
    }

    if (!hasStarted) {
      if (isHighlighted) {
        info.entity.color = COLOR_DELAY_DEEP;
      } else {
        info.entity.color = { _: "Color", r: 0, g: 0, b: 0, a: 0 };
      }
      continue;
    }

    if (!isHighlighted) {
      info.entity.color = getPurpleColor(daysLeft);
    }
  }
}

async function refreshTaskHighlights() {
  const data = await buildGraphData();
  const { entityMap, edgeList } = data;

  // 根据几何分类自动设置边线型：sequential（横向）→ 虚线，parent-child（纵向）→ 实线
  for (const e of edgeList) {
    try {
      e.edge.lineType = e.type === "sequential" ? "dashed" : "solid";
    } catch (_) {
      /* skip if edge doesn't support lineType */
    }
  }

  // find all roots (nodes with 🛠️ icon)
  const rootUuids = [];
  for (const [uuid, info] of Object.entries(entityMap)) {
    if (info.text && info.text.includes("🛠️")) {
      rootUuids.push(uuid);
    }
  }

  // build completed set (nodes starting with ✅ or ❌)
  const completedSet = new Set();
  for (const [uuid, info] of Object.entries(entityMap)) {
    if (info.text && isCompleted(info.text)) {
      completedSet.add(uuid);
    }
  }

  // clear all 📌 highlights (only remove pin, preserve status colors)
  for (const [uuid, info] of Object.entries(entityMap)) {
    if (info.text && info.text.includes("📌")) {
      const clean = removePin(info.text);
      await info.entity.rename(clean);
      if (!clean.startsWith("✅ ") && !clean.startsWith("❌ ")) {
        info.entity.color = { _: "Color", r: 0, g: 0, b: 0, a: 0 };
      }
      info.text = clean;
    }
  }

  // compute next tasks for each root
  for (const rootUuid of rootUuids) {
    const nextUuids = findReadyNodes(rootUuid, data, completedSet);
    for (const nextUuid of nextUuids) {
      const info = entityMap[nextUuid];
      if (!info) continue;
      const text = info.text;
      if (text.includes("📌")) continue;
      if (text.includes("🛠️")) continue;
      const base = getBaseName(text);
      const status = text.startsWith("✅ ")
        ? "✅ "
        : text.startsWith("❌ ")
          ? "❌ "
          : "";
      const role = text.includes("🛠️") ? "🛠️ " : "";
      await info.entity.rename(`${status}${role}📌 ${base}`);
      info.entity.color = isDelayed(base) ? COLOR_DELAY : COLOR_ACTIVATE;
      info.text = `${status}${role}📌 ${base}`;
    }
  }

  await processDateMarkings(entityMap);
  return data;
}

async function handlePostStatusChange(stageManager, uuidList, wasCompletedList) {
  // 记录本次操作涉及的树
  const dataBefore = await buildGraphData();
  const affectedRoots = [];
  const statusActions = [];
  for (let i = 0; i < uuidList.length; i++) {
    const uuid = uuidList[i];
    if (!uuid) continue;
    statusActions.push({ uuid, wasCompleted: wasCompletedList[i] });
    const root = findRoot(uuid, dataBefore);
    if (root && !affectedRoots.includes(root)) {
      affectedRoots.push(root);
    }
  }

  const dataAfter = await refreshTaskHighlights();

  // 焦点转移：在受影响的树中按优先级只选一个 📌 节点
  if (affectedRoots.length > 0) {

    // 构建 completedSet
    const completedSet = new Set();
    for (const [u, info] of Object.entries(dataAfter.entityMap)) {
      if (info.text && isCompleted(info.text)) {
        completedSet.add(u);
      }
    }

    // 收集所有 📌 节点
    const pinSet = new Set();
    for (const [u, info] of Object.entries(dataAfter.entityMap)) {
      if (info.text && info.text.includes("📌")) {
        pinSet.add(u);
      }
    }

    const isNotDelayedPin = (u) => {
      const info = dataAfter.entityMap[u];
      return info && pinSet.has(u) && !isDelayed(info.text);
    };

    let targetUuid = null;

    for (const rootUuid of affectedRoots) {
      const dfsOrder = getDfsOrder(rootUuid, dataAfter, completedSet);

      // 筛选属于当前树（含 seqNext 分支）的状态变更节点
      const treeStatusActions = statusActions.filter((a) => dfsOrder.includes(a.uuid));

      // fallback：状态变更节点不在 DFS 树中（极少见），退化为取 ready[0]
      if (treeStatusActions.length === 0) {
        const ready = findReadyNodes(rootUuid, dataAfter, completedSet)
          .filter((u) => {
            const info = dataAfter.entityMap[u];
            return info && !info.text.includes("🛠️");
          });
        targetUuid = ready.find(isNotDelayedPin) || null;
        if (targetUuid) break;
        continue;
      }

      // 找右most 状态变更节点（DFS 序列中位置最大的）
      let rightmostIdx = -1;
      let rightmostUuid = null;
      let rightmostWasCompleted = false;
      for (const a of treeStatusActions) {
        const idx = dfsOrder.indexOf(a.uuid);
        if (idx > rightmostIdx) {
          rightmostIdx = idx;
          rightmostUuid = a.uuid;
          rightmostWasCompleted = a.wasCompleted;
        }
      }

      // 规则1：撤销完成 → 自身若就绪且非搁置则焦点归位
      if (rightmostWasCompleted && isNotDelayedPin(rightmostUuid)) {
        targetUuid = rightmostUuid;
        break;
      }

      // 规则2：向上查找最近的已就绪祖先（跳过搁置）
      {
        let current = rightmostUuid;
        while (true) {
          const parent = findParent(current, dataAfter);
          if (!parent) break;
          if (isNotDelayedPin(parent)) {
            targetUuid = parent;
            break;
          }
          current = parent;
        }
      }
      if (targetUuid) break;

      // 规则3：DFS 前向扫描，找首个非搁置 📌
      for (let i = rightmostIdx + 1; i < dfsOrder.length; i++) {
        if (isNotDelayedPin(dfsOrder[i])) {
          targetUuid = dfsOrder[i];
          break;
        }
      }
      if (targetUuid) break;

      // 规则4：前向未命中则从头环绕扫描，跳过搁置
      for (let i = 0; i < rightmostIdx; i++) {
        if (isNotDelayedPin(dfsOrder[i])) {
          targetUuid = dfsOrder[i];
          break;
        }
      }
      if (targetUuid) break;
    }

    await stageManager.clearSelectAll();
    if (targetUuid) {
      const pinEntities = await stageManager.getEntitiesByUUIDs([targetUuid]);
      const targetEnt = await pinEntities[0];
      if (targetEnt) {
        targetEnt.isSelected = true;
      }
    }
  }
}

// --- keybinds ---

// 首次加载时初始化设置（默认 6°），之后可在扩展设置页修改
{
  const saved = await prg.settings_getOwn("sequentialThresholdDeg");
  if (saved != null) {
    const deg = parseFloat(saved);
    if (!isNaN(deg) && deg > 0 && deg < 90) {
      sequentialThresholdDeg = deg;
      SEQUENTIAL_THRESHOLD = Math.tan(deg * Math.PI / 180);
    }
  } else {
    await prg.settings_setOwn("sequentialThresholdDeg", 6);
  }
}

await prg.keybinds_register(
  "smartOKK",
  { $lucide: "Check" },
  "o k k",
  Comlink.proxy(async () => {
    const project = await prg.tabs_getCurrentProject();
    const stageManager = await project.stageManager;
    const selectedEntities = await stageManager.getSelectedEntities();
    if (selectedEntities.length === 0) return;

    // 先记录 OKK 前的状态（rename 之前）
    const uuidList = [];
    const wasCompletedList = [];
    for (const ent of selectedEntities) {
      const text = await ent.text;
      if (!text) { uuidList.push(null); wasCompletedList.push(null); continue; }
      uuidList.push(await ent.uuid);
      wasCompletedList.push(isCompleted(text));
    }

    for (let i = 0; i < selectedEntities.length; i++) {
      const ent = selectedEntities[i];
      const text = await ent.text;
      if (!text) continue;
      if (text.startsWith("✅ ")) {
        await ent.rename(text.slice(2));
        ent.color = { _: "Color", r: 0, g: 0, b: 0, a: 0 };
      } else {
        const base = text.startsWith("❌ ") ? text.slice(2) : text;
        await ent.rename(`✅ ${base}`);
        ent.color = { _: "Color", r: 52, g: 103, b: 53 };
      }
    }

    await handlePostStatusChange(stageManager, uuidList, wasCompletedList);
  }),
);

await prg.keybinds_register(
  "smartERR",
  { $lucide: "X" },
  "e r r",
  Comlink.proxy(async () => {
    const project = await prg.tabs_getCurrentProject();
    const stageManager = await project.stageManager;
    const selectedEntities = await stageManager.getSelectedEntities();
    if (selectedEntities.length === 0) return;

    // 先记录 ERR 前的状态（rename 之前）
    const uuidList = [];
    const wasCompletedList = [];
    for (const ent of selectedEntities) {
      const text = await ent.text;
      if (!text) { uuidList.push(null); wasCompletedList.push(null); continue; }
      uuidList.push(await ent.uuid);
      wasCompletedList.push(isCompleted(text));
    }

    for (let i = 0; i < selectedEntities.length; i++) {
      const ent = selectedEntities[i];
      const text = await ent.text;
      if (!text) continue;
      if (text.startsWith("❌ ")) {
        await ent.rename(text.slice(2));
        ent.color = { _: "Color", r: 0, g: 0, b: 0, a: 0 };
      } else {
        const base = text.startsWith("✅ ") ? text.slice(2) : text;
        await ent.rename(`❌ ${base}`);
        ent.color = { _: "Color", r: 52, g: 12, b: 14 };
      }
    }

    await handlePostStatusChange(stageManager, uuidList, wasCompletedList);
  }),
);

await prg.keybinds_register(
  "smartTRR",
  { $lucide: "Hammer" },
  "t r r",
  Comlink.proxy(async () => {
    const project = await prg.tabs_getCurrentProject();
    const stageManager = await project.stageManager;
    const data = await buildGraphData();
    const { entityMap } = data;

    const selectedEntities = await stageManager.getSelectedEntities();
    const first = await selectedEntities[0];
    if (!first) {
      await refreshTaskHighlights();
      return;
    }

    const selUuid = await first.uuid;
    const rootUuid = findRoot(selUuid, data);
    if (!rootUuid) return;

    const rootInfo = entityMap[rootUuid];
    if (!rootInfo) return;
    const base = getBaseName(rootInfo.text);
    const status = rootInfo.text.startsWith("✅ ")
      ? "✅ "
      : rootInfo.text.startsWith("❌ ")
        ? "❌ "
        : "";
    await rootInfo.entity.rename(`${status}🛠️ ${base}`);
    rootInfo.entity.color = { _: "Color", r: 26, g: 102, b: 255 };
    rootInfo.text = `${status}🛠️ ${base}`;

    await refreshTaskHighlights();
  }),
);
