import { useState, useMemo } from "react";

// ═══════════════════════════════════════════════
// 河狸云 · 个性化精装选配系统 (5房间完整版)
// ═══════════════════════════════════════════════

const ROOM_DATA = {
  living: {
    name: "客厅", label: "客 厅",
    categories: [
      { id: "floor", name: "地面", icon: "◫", options: [
        { id: "lf1", name: "爵士白大理石", brand: "诺贝尔", model: "W63012", price: 428, unit: "㎡", qty: 35, color: "#e8e4df", accent: "#d4cfc8", pat: "marble" },
        { id: "lf2", name: "北美白橡木地板", brand: "大自然", model: "DSQ001", price: 368, unit: "㎡", qty: 35, color: "#c4a97d", accent: "#b89968", pat: "wood" },
        { id: "lf3", name: "莫兰迪灰瓷砖", brand: "马可波罗", model: "FG8025", price: 298, unit: "㎡", qty: 35, color: "#a8a09a", accent: "#9b938d", pat: "tile" },
        { id: "lf4", name: "水磨石", brand: "蒙娜丽莎", model: "TS6601", price: 358, unit: "㎡", qty: 35, color: "#d6d0c8", accent: "#bfb8ae", pat: "terrazzo" },
      ]},
      { id: "wall", name: "墙面", icon: "▦", options: [
        { id: "lw1", name: "云白乳胶漆", brand: "多乐士", model: "A991", price: 65, unit: "㎡", qty: 82, color: "#f5f2ee", accent: "#f5f2ee", pat: "solid" },
        { id: "lw2", name: "暖灰微水泥", brand: "磐多魔", model: "MC-G03", price: 320, unit: "㎡", qty: 82, color: "#c8c0b8", accent: "#bdb5ac", pat: "concrete" },
        { id: "lw3", name: "白栎木饰面", brand: "科定", model: "KD-S12", price: 480, unit: "㎡", qty: 82, color: "#d4c5a9", accent: "#c9ba9a", pat: "woodpanel" },
        { id: "lw4", name: "鼠尾草绿", brand: "本杰明摩尔", model: "HC-114", price: 88, unit: "㎡", qty: 82, color: "#b5bfa8", accent: "#a8b29b", pat: "solid" },
      ]},
      { id: "tvwall", name: "背景墙", icon: "▣", options: [
        { id: "lt1", name: "岩板一体背景", brand: "德利丰", model: "YB-8201", price: 12800, unit: "套", qty: 1, color: "#6b6560", accent: "#5c5650", pat: "slate" },
        { id: "lt2", name: "黑胡桃木格栅", brand: "科定", model: "KD-TV06", price: 8600, unit: "套", qty: 1, color: "#5c4a3a", accent: "#4d3d2e", pat: "slat" },
        { id: "lt3", name: "大理石+金属", brand: "诺贝尔", model: "TV-M01", price: 15800, unit: "套", qty: 1, color: "#ddd8d0", accent: "#c5a86c", pat: "marblemetal" },
        { id: "lt4", name: "极简石膏板", brand: "可耐福", model: "GK-S01", price: 4200, unit: "套", qty: 1, color: "#ebe8e4", accent: "#ddd9d4", pat: "minimal" },
      ]},
      { id: "ceiling", name: "吊顶", icon: "⊡", options: [
        { id: "lc1", name: "平顶+暗装灯带", brand: "欧普", model: "CL-F01", price: 180, unit: "㎡", qty: 35, color: "#f8f6f3", accent: "#fff8e7", pat: "flat" },
        { id: "lc2", name: "双层叠级吊顶", brand: "可耐福", model: "CL-D02", price: 260, unit: "㎡", qty: 35, color: "#f0ede8", accent: "#e8e4de", pat: "double" },
        { id: "lc3", name: "仿木梁吊顶", brand: "科定", model: "CL-W03", price: 420, unit: "㎡", qty: 35, color: "#ede8e0", accent: "#b89968", pat: "beam" },
      ]},
      { id: "sofa", name: "沙发", icon: "⊏", options: [
        { id: "ls1", name: "烟灰L型布艺", brand: "HAY", model: "MAGS-L", price: 28600, unit: "套", qty: 1, color: "#8a8580", accent: "#7d7873", pat: "fabric" },
        { id: "ls2", name: "奶油白意式真皮", brand: "Natuzzi", model: "IAGO", price: 42000, unit: "套", qty: 1, color: "#ede5d8", accent: "#e0d8ca", pat: "leather" },
        { id: "ls3", name: "复古绿丝绒", brand: "Cassina", model: "MARA", price: 56000, unit: "套", qty: 1, color: "#5a7a62", accent: "#4d6b54", pat: "velvet" },
        { id: "ls4", name: "黑胡桃实木框架", brand: "半木", model: "LUBAN", price: 35800, unit: "套", qty: 1, color: "#5c4a3a", accent: "#c8b8a0", pat: "woodframe" },
      ]},
      { id: "light", name: "主灯", icon: "◉", options: [
        { id: "ll1", name: "无主灯设计", brand: "三雄极光", model: "NL-S01", price: 6800, unit: "套", qty: 1, color: "#fff8e7", accent: "#fff3d4", pat: "recessed" },
        { id: "ll2", name: "黄铜球形吊灯", brand: "FLOS", model: "IC-S2", price: 12800, unit: "套", qty: 1, color: "#c5a86c", accent: "#b89755", pat: "pendant" },
        { id: "ll3", name: "极简线性灯", brand: "VIBIA", model: "HALO", price: 8900, unit: "套", qty: 1, color: "#f0ede8", accent: "#fff8e7", pat: "linear" },
      ]},
    ],
    defaults: { floor: "lf1", wall: "lw1", tvwall: "lt1", ceiling: "lc1", sofa: "ls1", light: "ll1" },
  },
  master: {
    name: "主卧", label: "主 卧",
    categories: [
      { id: "floor", name: "地面", icon: "◫", options: [
        { id: "mf1", name: "胡桃木地板", brand: "大自然", model: "HT-W01", price: 458, unit: "㎡", qty: 22, color: "#8b7355", accent: "#7a6348", pat: "wood" },
        { id: "mf2", name: "奶油色橡木地板", brand: "圣象", model: "NK1008", price: 388, unit: "㎡", qty: 22, color: "#d4c5a9", accent: "#c4b595", pat: "wood" },
        { id: "mf3", name: "浅灰瓷砖", brand: "东鹏", model: "LN60", price: 268, unit: "㎡", qty: 22, color: "#c8c3bd", accent: "#b8b3ac", pat: "tile" },
      ]},
      { id: "wall", name: "墙面", icon: "▦", options: [
        { id: "mw1", name: "暖白乳胶漆", brand: "多乐士", model: "N991", price: 65, unit: "㎡", qty: 58, color: "#f8f4ef", accent: "#f8f4ef", pat: "solid" },
        { id: "mw2", name: "莫兰迪粉", brand: "本杰明摩尔", model: "HC-63", price: 88, unit: "㎡", qty: 58, color: "#e0cfc5", accent: "#d4c3b8", pat: "solid" },
        { id: "mw3", name: "薄荷灰绿", brand: "芬琳", model: "F487", price: 92, unit: "㎡", qty: 58, color: "#c5cfc5", accent: "#b8c2b8", pat: "solid" },
        { id: "mw4", name: "浅咖织物墙布", brand: "玉兰", model: "WB-208", price: 180, unit: "㎡", qty: 58, color: "#c8b8a5", accent: "#baa892", pat: "fabric" },
      ]},
      { id: "bedwall", name: "床头背景", icon: "▣", options: [
        { id: "mb1", name: "皮革软包", brand: "CBD", model: "BP-01", price: 6800, unit: "套", qty: 1, color: "#a08870", accent: "#8a7560", pat: "leather" },
        { id: "mb2", name: "木饰面+灯带", brand: "科定", model: "KD-B05", price: 8200, unit: "套", qty: 1, color: "#8b7355", accent: "#fff8e7", pat: "woodlight" },
        { id: "mb3", name: "艺术涂料", brand: "瓦帕", model: "AT-12", price: 5600, unit: "套", qty: 1, color: "#b8a898", accent: "#a89888", pat: "artpaint" },
        { id: "mb4", name: "极简乳胶漆", brand: "多乐士", model: "S991", price: 2400, unit: "套", qty: 1, color: "#e8e2dc", accent: "#ddd7d0", pat: "minimal" },
      ]},
      { id: "bed", name: "床", icon: "▭", options: [
        { id: "mbd1", name: "布艺软床 1.8m", brand: "CBD", model: "D028", price: 12800, unit: "套", qty: 1, color: "#c8bfb5", accent: "#b8afa5", pat: "fabric" },
        { id: "mbd2", name: "真皮软床 1.8m", brand: "慕思", model: "V6-T226", price: 18600, unit: "套", qty: 1, color: "#8a7a6a", accent: "#7a6a5a", pat: "leather" },
        { id: "mbd3", name: "实木框架床 1.8m", brand: "源氏木语", model: "Y8602", price: 8800, unit: "套", qty: 1, color: "#a08060", accent: "#c4a97d", pat: "woodframe" },
      ]},
      { id: "wardrobe", name: "衣柜", icon: "⊞", options: [
        { id: "mwr1", name: "白色极简平开门", brand: "索菲亚", model: "WR-W01", price: 16800, unit: "套", qty: 1, color: "#f0ece6", accent: "#e8e4de", pat: "white" },
        { id: "mwr2", name: "木纹推拉门", brand: "欧派", model: "WR-M02", price: 14200, unit: "套", qty: 1, color: "#a08060", accent: "#8b7050", pat: "woodslide" },
        { id: "mwr3", name: "玻璃+金属框", brand: "好莱客", model: "WR-G03", price: 19800, unit: "套", qty: 1, color: "#d8d4d0", accent: "#888", pat: "glass" },
      ]},
    ],
    defaults: { floor: "mf1", wall: "mw1", bedwall: "mb1", bed: "mbd1", wardrobe: "mwr1" },
  },
  kitchen: {
    name: "厨房", label: "厨 房",
    categories: [
      { id: "floor", name: "地砖", icon: "◫", options: [
        { id: "kf1", name: "防滑灰色砖", brand: "诺贝尔", model: "KF-301", price: 228, unit: "㎡", qty: 10, color: "#b0aaa4", accent: "#a09a94", pat: "tile" },
        { id: "kf2", name: "仿木纹砖", brand: "马可波罗", model: "KF-W02", price: 268, unit: "㎡", qty: 10, color: "#baa892", accent: "#a89880", pat: "wood" },
        { id: "kf3", name: "白色哑光砖", brand: "东鹏", model: "KF-B03", price: 198, unit: "㎡", qty: 10, color: "#e8e4e0", accent: "#dddad6", pat: "tile" },
      ]},
      { id: "wall", name: "墙砖", icon: "▦", options: [
        { id: "kw1", name: "白色地铁砖", brand: "诺贝尔", model: "KW-S01", price: 148, unit: "㎡", qty: 18, color: "#f2efeb", accent: "#e8e5e0", pat: "subway" },
        { id: "kw2", name: "灰色大板砖", brand: "马可波罗", model: "KW-G02", price: 228, unit: "㎡", qty: 18, color: "#c5c0ba", accent: "#b5b0aa", pat: "largetile" },
        { id: "kw3", name: "鱼骨拼花砖", brand: "蒙娜丽莎", model: "KW-H03", price: 318, unit: "㎡", qty: 18, color: "#e5e0da", accent: "#d5d0c8", pat: "herringbone" },
      ]},
      { id: "cabinet", name: "橱柜", icon: "▤", options: [
        { id: "kc1", name: "白色烤漆门板", brand: "欧派", model: "CB-W01", price: 22000, unit: "套", qty: 1, color: "#f5f2ef", accent: "#e8e5e0", pat: "glossy" },
        { id: "kc2", name: "原木色模压门板", brand: "志邦", model: "CB-N02", price: 18000, unit: "套", qty: 1, color: "#c4a97d", accent: "#b49970", pat: "woodgrain" },
        { id: "kc3", name: "深灰哑光门板", brand: "金牌", model: "CB-G03", price: 24000, unit: "套", qty: 1, color: "#6a6560", accent: "#5a5550", pat: "matte" },
        { id: "kc4", name: "莫兰迪绿门板", brand: "司米", model: "CB-MG4", price: 20000, unit: "套", qty: 1, color: "#8a9a82", accent: "#7a8a72", pat: "matte" },
      ]},
      { id: "counter", name: "台面", icon: "▬", options: [
        { id: "kt1", name: "白色石英石", brand: "赛丽石", model: "CT-W01", price: 4800, unit: "套", qty: 1, color: "#f0ece8", accent: "#e5e0dc", pat: "quartz" },
        { id: "kt2", name: "灰色岩板", brand: "德利丰", model: "CT-G02", price: 6800, unit: "套", qty: 1, color: "#8a8580", accent: "#7a7570", pat: "sintered" },
        { id: "kt3", name: "不锈钢台面", brand: "欧琳", model: "CT-S03", price: 5200, unit: "套", qty: 1, color: "#c5c5c8", accent: "#b5b5b8", pat: "steel" },
      ]},
      { id: "appliance", name: "烟灶套装", icon: "◎", options: [
        { id: "ka1", name: "侧吸+灶具套装", brand: "方太", model: "JQ01TS", price: 12800, unit: "套", qty: 1, color: "#2a2a2a", accent: "#444", pat: "side" },
        { id: "ka2", name: "集成灶", brand: "火星人", model: "X7B", price: 16800, unit: "套", qty: 1, color: "#3a3a3a", accent: "#555", pat: "integrated" },
        { id: "ka3", name: "顶吸+灶具欧式", brand: "老板", model: "CXW-260", price: 9800, unit: "套", qty: 1, color: "#d0d0d0", accent: "#bbb", pat: "top" },
      ]},
    ],
    defaults: { floor: "kf1", wall: "kw1", cabinet: "kc1", counter: "kt1", appliance: "ka1" },
  },
  bath: {
    name: "卫生间", label: "卫生间",
    categories: [
      { id: "floor", name: "地砖", icon: "◫", options: [
        { id: "bf1", name: "防滑深灰砖", brand: "诺贝尔", model: "BF-D01", price: 248, unit: "㎡", qty: 6, color: "#7a7570", accent: "#6a6560", pat: "tile" },
        { id: "bf2", name: "木纹防滑砖", brand: "马可波罗", model: "BF-W02", price: 288, unit: "㎡", qty: 6, color: "#a89880", accent: "#988870", pat: "wood" },
        { id: "bf3", name: "水磨石砖", brand: "蒙娜丽莎", model: "BF-T03", price: 328, unit: "㎡", qty: 6, color: "#c8c2ba", accent: "#b8b2aa", pat: "terrazzo" },
      ]},
      { id: "wall", name: "墙砖", icon: "▦", options: [
        { id: "bw1", name: "白色亮面砖", brand: "东鹏", model: "BW-W01", price: 168, unit: "㎡", qty: 22, color: "#f0ece8", accent: "#e8e4e0", pat: "glossy" },
        { id: "bw2", name: "浅灰哑光砖", brand: "诺贝尔", model: "BW-G02", price: 198, unit: "㎡", qty: 22, color: "#c8c4c0", accent: "#bab6b2", pat: "matte" },
        { id: "bw3", name: "奶油色微水泥", brand: "磐多魔", model: "BW-C03", price: 380, unit: "㎡", qty: 22, color: "#ddd5ca", accent: "#cec6ba", pat: "concrete" },
      ]},
      { id: "vanity", name: "浴室柜", icon: "▤", options: [
        { id: "bv1", name: "白色悬挂式 80cm", brand: "TOTO", model: "LDSW601", price: 8800, unit: "套", qty: 1, color: "#f0ece6", accent: "#e5e0da", pat: "white" },
        { id: "bv2", name: "木纹落地式 100cm", brand: "箭牌", model: "AE2507", price: 6200, unit: "套", qty: 1, color: "#a08060", accent: "#8b7050", pat: "wood" },
        { id: "bv3", name: "岩板一体盆 90cm", brand: "恒洁", model: "HBM-801", price: 12800, unit: "套", qty: 1, color: "#8a8580", accent: "#7a7570", pat: "sintered" },
      ]},
      { id: "toilet", name: "马桶", icon: "◯", options: [
        { id: "bt1", name: "智能马桶一体机", brand: "TOTO", model: "CES99", price: 16800, unit: "台", qty: 1, color: "#f5f2ef", accent: "#eae7e2", pat: "smart" },
        { id: "bt2", name: "壁挂式马桶", brand: "杜拉维特", model: "ME-252009", price: 12600, unit: "台", qty: 1, color: "#f0ede8", accent: "#e5e2dc", pat: "wallhung" },
        { id: "bt3", name: "普通连体马桶", brand: "科勒", model: "K-5171T", price: 4800, unit: "台", qty: 1, color: "#f2efea", accent: "#e8e5e0", pat: "standard" },
      ]},
      { id: "shower", name: "淋浴", icon: "⊕", options: [
        { id: "bs1", name: "恒温花洒套装", brand: "汉斯格雅", model: "RD-S240", price: 8800, unit: "套", qty: 1, color: "#c0c0c5", accent: "#aaaaaf", pat: "chrome" },
        { id: "bs2", name: "黑色暗装花洒", brand: "科勒", model: "K-77982T", price: 12800, unit: "套", qty: 1, color: "#3a3a3a", accent: "#2a2a2a", pat: "black" },
        { id: "bs3", name: "钢琴键花洒系统", brand: "摩恩", model: "PK-600", price: 6800, unit: "套", qty: 1, color: "#e0e0e2", accent: "#d0d0d2", pat: "piano" },
      ]},
    ],
    defaults: { floor: "bf1", wall: "bw1", vanity: "bv1", toilet: "bt1", shower: "bs1" },
  },
  study: {
    name: "书房", label: "书 房",
    categories: [
      { id: "floor", name: "地面", icon: "◫", options: [
        { id: "sf1", name: "深色橡木地板", brand: "大自然", model: "SF-D01", price: 418, unit: "㎡", qty: 12, color: "#8b7355", accent: "#7a6348", pat: "wood" },
        { id: "sf2", name: "浅灰地砖", brand: "马可波罗", model: "SF-G02", price: 258, unit: "㎡", qty: 12, color: "#b8b3ad", accent: "#a8a39d", pat: "tile" },
        { id: "sf3", name: "人字拼地板", brand: "圣象", model: "SF-H03", price: 488, unit: "㎡", qty: 12, color: "#b89968", accent: "#a88858", pat: "herringbone" },
      ]},
      { id: "wall", name: "墙面", icon: "▦", options: [
        { id: "sw1", name: "暖白乳胶漆", brand: "多乐士", model: "S991-W", price: 65, unit: "㎡", qty: 40, color: "#f5f2ee", accent: "#f0ede8", pat: "solid" },
        { id: "sw2", name: "烟灰蓝", brand: "本杰明摩尔", model: "HC-159", price: 88, unit: "㎡", qty: 40, color: "#a0aab5", accent: "#909aa5", pat: "solid" },
        { id: "sw3", name: "浅木饰面", brand: "科定", model: "KD-S20", price: 420, unit: "㎡", qty: 40, color: "#d4c5a9", accent: "#c4b599", pat: "woodpanel" },
      ]},
      { id: "bookwall", name: "书柜/书架", icon: "▤", options: [
        { id: "sbk1", name: "整墙书柜 白色", brand: "索菲亚", model: "BK-W01", price: 14800, unit: "套", qty: 1, color: "#f0ece6", accent: "#e5e0da", pat: "white" },
        { id: "sbk2", name: "胡桃木开放书架", brand: "源氏木语", model: "BK-N02", price: 9800, unit: "套", qty: 1, color: "#6b5540", accent: "#5b4530", pat: "walnut" },
        { id: "sbk3", name: "金属+木组合架", brand: "HAY", model: "BK-M03", price: 12800, unit: "套", qty: 1, color: "#333", accent: "#c4a97d", pat: "metal" },
      ]},
      { id: "desk", name: "书桌", icon: "▭", options: [
        { id: "sd1", name: "实木大板桌 160cm", brand: "半木", model: "DK-W01", price: 12800, unit: "套", qty: 1, color: "#8b7355", accent: "#7a6348", pat: "solidwood" },
        { id: "sd2", name: "白色升降桌 140cm", brand: "乐歌", model: "E5", price: 4800, unit: "套", qty: 1, color: "#f0ece6", accent: "#d0d0d0", pat: "standing" },
        { id: "sd3", name: "岩板书桌 150cm", brand: "林氏木业", model: "DK-S03", price: 6800, unit: "套", qty: 1, color: "#6a6560", accent: "#5a5550", pat: "sintered" },
      ]},
      { id: "light", name: "灯具", icon: "◉", options: [
        { id: "slt1", name: "无主灯+轨道灯", brand: "三雄极光", model: "SL-T01", price: 4800, unit: "套", qty: 1, color: "#fff8e7", accent: "#fff3d4", pat: "track" },
        { id: "slt2", name: "实木吊灯", brand: "新特丽", model: "SL-W02", price: 3800, unit: "套", qty: 1, color: "#b89968", accent: "#a88858", pat: "woodpendant" },
        { id: "slt3", name: "极简吸顶灯", brand: "欧普", model: "SL-F03", price: 1800, unit: "套", qty: 1, color: "#f5f2ef", accent: "#fff8e7", pat: "flush" },
      ]},
    ],
    defaults: { floor: "sf1", wall: "sw1", bookwall: "sbk1", desk: "sd1", light: "slt1" },
  },
};

const ROOM_ORDER = ["living","master","kitchen","bath","study"];
const fmt = n => n.toLocaleString("zh-CN");

function getOpt(room, catId, optId) {
  const cat = ROOM_DATA[room]?.categories.find(c => c.id === catId);
  return cat?.options.find(o => o.id === optId);
}

function calcRoomTotal(room, sel) {
  return Object.entries(sel).reduce((s, [c, o]) => {
    const op = getOpt(room, c, o);
    return s + (op ? op.price * op.qty : 0);
  }, 0);
}

// ── Scene renderers per room ──

function LivingScene({ sel }) {
  const f = getOpt("living","floor",sel.floor), w = getOpt("living","wall",sel.wall), tv = getOpt("living","tvwall",sel.tvwall);
  const ce = getOpt("living","ceiling",sel.ceiling), so = getOpt("living","sofa",sel.sofa), li = getOpt("living","light",sel.light);
  const T = "all 0.5s ease";
  return <div style={{ width:"100%",height:"100%",position:"relative",overflow:"hidden",background:`linear-gradient(180deg,${ce?.color} 0%,${w?.color} 25%,${w?.color} 62%,${f?.color} 62%,${f?.color} 100%)`,transition:T }}>
    <div style={{position:"absolute",top:0,left:0,right:0,height:"20%",background:ce?.color,transition:T,borderBottom:ce?.pat==="double"?"4px solid rgba(0,0,0,0.06)":"none"}}>
      {(ce?.pat==="flat"||ce?.pat==="double")&&<div style={{position:"absolute",bottom:ce?.pat==="double"?18:0,left:"8%",right:"8%",height:2,background:`linear-gradient(90deg,transparent,${ce?.accent},transparent)`,boxShadow:`0 0 25px 10px ${ce?.accent}40`}}/>}
      {ce?.pat==="beam"&&[0,1,2,3].map(i=><div key={i} style={{position:"absolute",bottom:0,left:`${12+i*22}%`,width:"7%",height:"100%",background:`linear-gradient(180deg,${ce.accent}cc,${ce.accent}44)`,borderRadius:"0 0 4px 4px"}}/>)}
      {li?.pat==="pendant"&&<div style={{position:"absolute",bottom:-55,left:"50%",transform:"translateX(-50%)"}}><div style={{width:2,height:35,background:li.color,margin:"0 auto"}}/><div style={{width:44,height:44,borderRadius:"50%",background:`radial-gradient(circle,#fff8,${li.color})`,boxShadow:`0 0 50px 20px ${li.accent}30`,margin:"0 auto"}}/></div>}
      {li?.pat==="linear"&&<div style={{position:"absolute",bottom:-8,left:"22%",right:"22%",height:5,background:li.color,borderRadius:3,boxShadow:`0 0 35px 12px ${li.accent}20`}}/>}
    </div>
    <div style={{position:"absolute",top:"20%",left:0,width:"18%",bottom:"38%",background:w?.color,transition:T,transform:"perspective(800px) rotateY(6deg)",transformOrigin:"right center"}}>
      <div style={{position:"absolute",top:"12%",left:"15%",width:"65%",height:"58%",border:"3px solid rgba(0,0,0,0.06)",borderRadius:2,background:"linear-gradient(135deg,#d8e4ee,#b8cede,#a8bed0)"}}>
        <div style={{position:"absolute",top:0,left:"50%",width:2,height:"100%",background:"rgba(0,0,0,0.06)"}}/><div style={{position:"absolute",top:"50%",left:0,width:"100%",height:2,background:"rgba(0,0,0,0.06)"}}/>
      </div>
    </div>
    <div style={{position:"absolute",top:"20%",right:0,width:"16%",bottom:"38%",background:w?.color,transition:T,transform:"perspective(800px) rotateY(-6deg)",transformOrigin:"left center"}}/>
    <div style={{position:"absolute",top:"20%",left:"18%",right:"16%",bottom:"38%",background:tv?.color,transition:T,display:"flex",alignItems:"center",justifyContent:"center"}}>
      {tv?.pat==="slat"&&<div style={{position:"absolute",inset:0,opacity:0.35}}>{Array.from({length:22},(_,i)=><div key={i} style={{position:"absolute",left:`${i*4.5}%`,top:0,width:"2.5%",height:"100%",background:i%2===0?tv.accent:"transparent"}}/>)}</div>}
      {tv?.pat==="marblemetal"&&<><div style={{position:"absolute",left:"3%",top:"4%",bottom:"4%",width:3,background:`linear-gradient(180deg,${tv.accent},${tv.accent}66)`}}/><div style={{position:"absolute",right:"3%",top:"4%",bottom:"4%",width:3,background:`linear-gradient(180deg,${tv.accent},${tv.accent}66)`}}/></>}
      {tv?.pat==="slate"&&<div style={{position:"absolute",inset:0,opacity:0.12}}>{[0,1,2,3,4,5].map(i=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*18}%`,height:1,background:"rgba(0,0,0,0.4)"}}/>)}</div>}
      <div style={{width:"44%",aspectRatio:"16/9",background:"#111",borderRadius:5,border:"3px solid #0a0a0a",boxShadow:"0 6px 40px rgba(0,0,0,0.35),inset 0 0 50px rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2}}>
        <div style={{width:"90%",height:"86%",borderRadius:3,background:"linear-gradient(135deg,#08080f,#10101a,#08080f)",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:4}}>
          <div style={{fontSize:10,color:"#ffffff22",letterSpacing:5}}>个性化精装</div><div style={{fontSize:16,color:"#ffffff15",letterSpacing:8,fontWeight:300}}>远洋 · 质造</div>
        </div>
      </div>
      <div style={{position:"absolute",bottom:0,left:"14%",right:"14%",height:"15%",background:tv?.pat==="slat"?tv.accent:tv?.pat==="marblemetal"?"#eee8e0":"#3a3530",borderRadius:"4px 4px 0 0"}}/>
    </div>
    <div style={{position:"absolute",left:0,right:0,bottom:0,height:"38%",background:f?.color,transition:T,transform:"perspective(500px) rotateX(3deg)",transformOrigin:"top center"}}>
      {f?.pat==="tile"&&<div style={{position:"absolute",inset:0,opacity:0.1}}>{[...Array(9)].map((_,i)=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*12.5}%`,height:1,background:"rgba(0,0,0,0.35)"}}/>)}{[...Array(14)].map((_,i)=><div key={`v${i}`} style={{position:"absolute",top:0,bottom:0,left:`${i*7.7}%`,width:1,background:"rgba(0,0,0,0.35)"}}/>)}</div>}
      {f?.pat==="wood"&&<div style={{position:"absolute",inset:0,opacity:0.12}}>{[...Array(18)].map((_,i)=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*5.8}%`,height:1,background:`rgba(0,0,0,${0.15+i%3*0.12})`}}/>)}</div>}
      {f?.pat==="terrazzo"&&<div style={{position:"absolute",inset:0,opacity:0.22}}>{[...Array(35)].map((_,i)=><div key={i} style={{position:"absolute",left:`${(i*41+13)%93}%`,top:`${(i*53+7)%88}%`,width:3+i%5*2,height:3+i%5*2,borderRadius:"40%",background:["#888","#aaa","#777","#bbb","#999","#c5a86c"][i%6]}}/>)}</div>}
      {f?.pat==="marble"&&<svg style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.08}} viewBox="0 0 500 200" preserveAspectRatio="none"><path d="M0,40 Q100,10 200,50 T400,30 T500,60" stroke="#888" strokeWidth="1.2" fill="none"/><path d="M0,100 Q130,75 260,110 T500,90" stroke="#888" strokeWidth="0.9" fill="none"/></svg>}
    </div>
    <div style={{position:"absolute",bottom:"22%",left:"50%",transform:"translateX(-50%)",width:"56%",height:"20%",transition:T}}>
      <div style={{position:"absolute",top:0,left:"4%",right:"4%",height:"42%",background:so?.color,borderRadius:"8px 8px 0 0",transition:T}}/>
      <div style={{position:"absolute",top:"38%",left:0,right:0,height:"42%",background:so?.color,borderRadius:7,boxShadow:"0 5px 25px rgba(0,0,0,0.12)",transition:T}}>
        {so?.pat==="woodframe"&&<div style={{position:"absolute",inset:0,borderRadius:7,border:`5px solid ${so.accent}`}}/>}
      </div>
      <div style={{position:"absolute",bottom:0,left:"8%",width:8,height:"14%",background:so?.pat==="woodframe"?so.accent:"#555",borderRadius:2}}/><div style={{position:"absolute",bottom:0,right:"8%",width:8,height:"14%",background:so?.pat==="woodframe"?so.accent:"#555",borderRadius:2}}/>
      {(so?.id==="ls1"||so?.pat==="velvet")&&<div style={{position:"absolute",top:"38%",right:"-18%",width:"22%",height:"42%",background:so?.color,borderRadius:"0 7px 7px 0",opacity:0.92,transition:T}}/>}
    </div>
    <div style={{position:"absolute",bottom:"14%",left:"50%",transform:"translateX(-50%)",width:"18%",height:"4.5%",background:"rgba(75,65,55,0.55)",borderRadius:28}}/>
  </div>;
}

function BedroomScene({ sel }) {
  const f=getOpt("master","floor",sel.floor), w=getOpt("master","wall",sel.wall), bw=getOpt("master","bedwall",sel.bedwall);
  const bed=getOpt("master","bed",sel.bed), wr=getOpt("master","wardrobe",sel.wardrobe);
  const T="all 0.5s ease";
  return <div style={{width:"100%",height:"100%",position:"relative",overflow:"hidden",background:`linear-gradient(180deg,#f5f2ee 0%,${w?.color} 22%,${w?.color} 60%,${f?.color} 60%,${f?.color} 100%)`,transition:T}}>
    <div style={{position:"absolute",top:0,left:0,right:0,height:"18%",background:"#f5f2ee",transition:T}}>
      <div style={{position:"absolute",bottom:0,left:"8%",right:"8%",height:2,background:"linear-gradient(90deg,transparent,#fff8e740,transparent)",boxShadow:"0 0 20px 8px #fff8e730"}}/>
    </div>
    <div style={{position:"absolute",top:"18%",left:0,width:"16%",bottom:"40%",background:w?.color,transition:T,transform:"perspective(800px) rotateY(5deg)",transformOrigin:"right center"}}>
      <div style={{position:"absolute",top:"10%",left:"20%",width:"60%",height:"60%",border:"3px solid rgba(0,0,0,0.05)",background:"linear-gradient(135deg,#d8e4ee,#b8cede)"}}/>
    </div>
    <div style={{position:"absolute",top:"18%",right:0,width:"14%",bottom:"40%",background:w?.color,transition:T,transform:"perspective(800px) rotateY(-5deg)",transformOrigin:"left center"}}>
      <div style={{position:"absolute",top:"5%",left:"10%",right:"10%",bottom:"5%",background:wr?.color,transition:T,borderRadius:3,boxShadow:"inset 0 0 20px rgba(0,0,0,0.06)"}}>
        {wr?.pat==="woodslide"&&<div style={{position:"absolute",top:0,left:"48%",width:"4%",height:"100%",background:"rgba(0,0,0,0.08)"}}/>}
        {wr?.pat==="glass"&&<div style={{position:"absolute",inset:"8%",border:`2px solid ${wr.accent}`,borderRadius:2,background:"rgba(255,255,255,0.05)"}}/>}
      </div>
    </div>
    <div style={{position:"absolute",top:"18%",left:"16%",right:"14%",bottom:"40%",background:bw?.color,transition:T,display:"flex",alignItems:"center",justifyContent:"center"}}>
      {bw?.pat==="woodlight"&&<><div style={{position:"absolute",inset:0,opacity:0.15,background:"repeating-linear-gradient(0deg,transparent,transparent 8px,rgba(0,0,0,0.04) 8px,rgba(0,0,0,0.04) 9px)"}}/><div style={{position:"absolute",bottom:"35%",left:"5%",right:"5%",height:2,background:`linear-gradient(90deg,transparent,${bw.accent},transparent)`,boxShadow:`0 0 15px 5px ${bw.accent}30`}}/></>}
      {bw?.pat==="leather"&&<div style={{position:"absolute",inset:0,background:"linear-gradient(135deg,rgba(255,255,255,0.08),transparent 50%,rgba(0,0,0,0.04))"}}/>}
      {bw?.pat==="artpaint"&&<div style={{position:"absolute",inset:0,opacity:0.08,background:"radial-gradient(ellipse at 30% 40%,rgba(0,0,0,0.1),transparent 60%),radial-gradient(ellipse at 70% 60%,rgba(0,0,0,0.08),transparent 50%)"}}/>}
    </div>
    <div style={{position:"absolute",left:0,right:0,bottom:0,height:"40%",background:f?.color,transition:T,transform:"perspective(500px) rotateX(3deg)",transformOrigin:"top center"}}>
      {f?.pat==="wood"&&<div style={{position:"absolute",inset:0,opacity:0.12}}>{[...Array(18)].map((_,i)=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*5.8}%`,height:1,background:`rgba(0,0,0,${0.15+i%3*0.12})`}}/>)}</div>}
      {f?.pat==="tile"&&<div style={{position:"absolute",inset:0,opacity:0.1}}>{[...Array(8)].map((_,i)=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*14}%`,height:1,background:"rgba(0,0,0,0.3)"}}/>)}</div>}
    </div>
    <div style={{position:"absolute",bottom:"22%",left:"50%",transform:"translateX(-50%)",width:"50%",height:"22%",transition:T}}>
      <div style={{position:"absolute",top:0,left:"5%",right:"5%",height:"35%",background:bed?.color,borderRadius:"6px 6px 0 0",transition:T}}>
        {bed?.pat==="leather"&&<div style={{position:"absolute",inset:0,borderRadius:"inherit",background:"linear-gradient(135deg,rgba(255,255,255,0.1),transparent 50%)"}}/>}
      </div>
      <div style={{position:"absolute",top:"32%",left:0,right:0,height:"55%",background:bed?.pat==="woodframe"?bed.accent:"#e8e2dc",borderRadius:5,boxShadow:"0 4px 20px rgba(0,0,0,0.08)",transition:T}}>
        <div style={{position:"absolute",top:"10%",left:"8%",right:"8%",bottom:"10%",borderRadius:4,background:bed?.pat==="woodframe"?"#e8e2dc":"linear-gradient(180deg,#f5f0ea,#ede8e2)"}}/>
      </div>
      <div style={{position:"absolute",bottom:0,left:"8%",width:6,height:"12%",background:bed?.pat==="woodframe"?bed.accent:"#888",borderRadius:2}}/><div style={{position:"absolute",bottom:0,right:"8%",width:6,height:"12%",background:bed?.pat==="woodframe"?bed.accent:"#888",borderRadius:2}}/>
    </div>
    <div style={{position:"absolute",bottom:"26%",left:"12%",width:30,height:35,background:"rgba(90,80,70,0.4)",borderRadius:3}}/>
    <div style={{position:"absolute",bottom:"26%",right:"18%",width:30,height:35,background:"rgba(90,80,70,0.4)",borderRadius:3}}/>
  </div>;
}

function KitchenScene({ sel }) {
  const f=getOpt("kitchen","floor",sel.floor), w=getOpt("kitchen","wall",sel.wall), cab=getOpt("kitchen","cabinet",sel.cabinet);
  const ct=getOpt("kitchen","counter",sel.counter), ap=getOpt("kitchen","appliance",sel.appliance);
  const T="all 0.5s ease";
  return <div style={{width:"100%",height:"100%",position:"relative",overflow:"hidden",background:`linear-gradient(180deg,#f2efeb 0%,${w?.color} 20%,${w?.color} 55%,${f?.color} 55%,${f?.color} 100%)`,transition:T}}>
    <div style={{position:"absolute",top:0,left:0,right:0,height:"16%",background:"#f2efeb"}}>
      <div style={{position:"absolute",bottom:0,left:"10%",right:"10%",height:2,background:"linear-gradient(90deg,transparent,#fff8e730,transparent)"}}/>
    </div>
    <div style={{position:"absolute",top:"16%",left:0,right:0,bottom:"45%",background:w?.color,transition:T}}>
      {w?.pat==="subway"&&<div style={{position:"absolute",inset:0,opacity:0.08}}>{[...Array(10)].map((_,i)=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*10}%`,height:1,background:"rgba(0,0,0,0.3)"}}/>)}{[...Array(8)].map((_,i)=><div key={`s${i}`} style={{position:"absolute",top:0,bottom:0,left:`${i*13+((i%2)*6.5)}%`,width:1,background:"rgba(0,0,0,0.15)"}}/>)}</div>}
      {w?.pat==="herringbone"&&<div style={{position:"absolute",inset:0,opacity:0.08,background:"repeating-linear-gradient(45deg,transparent,transparent 10px,rgba(0,0,0,0.05) 10px,rgba(0,0,0,0.05) 11px),repeating-linear-gradient(-45deg,transparent,transparent 10px,rgba(0,0,0,0.05) 10px,rgba(0,0,0,0.05) 11px)"}}/>}
    </div>
    <div style={{position:"absolute",bottom:"45%",left:"5%",right:"5%",height:"3%",background:ct?.color,transition:T,boxShadow:"0 2px 8px rgba(0,0,0,0.08)"}}>
      {ct?.pat==="steel"&&<div style={{position:"absolute",inset:0,background:"linear-gradient(90deg,rgba(255,255,255,0.15),transparent 30%,rgba(255,255,255,0.1) 70%,transparent)"}}/>}
    </div>
    <div style={{position:"absolute",bottom:"25%",left:"5%",right:"5%",height:"20%",background:cab?.color,transition:T,borderRadius:"0 0 4px 4px",boxShadow:"0 4px 15px rgba(0,0,0,0.06)"}}>
      {[0,1,2,3].map(i=><div key={i} style={{position:"absolute",left:`${i*25+1}%`,top:"5%",width:"23%",height:"90%",border:"1px solid rgba(0,0,0,0.04)",borderRadius:3,background:"linear-gradient(180deg,rgba(255,255,255,0.04),transparent)"}}/>)}
      {cab?.pat==="woodgrain"&&<div style={{position:"absolute",inset:0,opacity:0.08,background:"repeating-linear-gradient(90deg,transparent,transparent 5px,rgba(0,0,0,0.03) 5px,rgba(0,0,0,0.03) 6px)"}}/>}
    </div>
    <div style={{position:"absolute",top:"20%",left:"50%",transform:"translateX(-50%)",width:"22%",height:"20%"}}>
      <div style={{width:"100%",height:"100%",background:ap?.color,borderRadius:4,transition:T,boxShadow:"0 4px 20px rgba(0,0,0,0.15)"}}>
        {ap?.pat==="integrated"&&<div style={{position:"absolute",top:0,left:0,right:0,height:"55%",background:"rgba(0,0,0,0.2)",borderRadius:"4px 4px 0 0"}}/>}
        <div style={{position:"absolute",top:"60%",left:"20%",right:"20%",display:"flex",gap:"8%",justifyContent:"center"}}>
          {[0,1].map(i=><div key={i} style={{width:"30%",aspectRatio:"1",borderRadius:"50%",border:"2px solid rgba(255,255,255,0.15)"}}/>)}
        </div>
      </div>
    </div>
    <div style={{position:"absolute",top:"18%",right:"8%",width:"15%",height:"28%",background:cab?.color,transition:T,borderRadius:3,boxShadow:"0 2px 10px rgba(0,0,0,0.06)"}}>
      <div style={{position:"absolute",inset:"4%",border:"1px solid rgba(0,0,0,0.04)",borderRadius:2}}/>
    </div>
    <div style={{position:"absolute",left:0,right:0,bottom:0,height:"25%",background:f?.color,transition:T}}>
      {f?.pat==="tile"&&<div style={{position:"absolute",inset:0,opacity:0.1}}>{[...Array(6)].map((_,i)=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*20}%`,height:1,background:"rgba(0,0,0,0.3)"}}/>)}{[...Array(10)].map((_,i)=><div key={`v${i}`} style={{position:"absolute",top:0,bottom:0,left:`${i*11}%`,width:1,background:"rgba(0,0,0,0.3)"}}/>)}</div>}
      {f?.pat==="wood"&&<div style={{position:"absolute",inset:0,opacity:0.1}}>{[...Array(12)].map((_,i)=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*8.5}%`,height:1,background:"rgba(0,0,0,0.2)"}}/>)}</div>}
    </div>
  </div>;
}

function BathScene({ sel }) {
  const f=getOpt("bath","floor",sel.floor), w=getOpt("bath","wall",sel.wall), v=getOpt("bath","vanity",sel.vanity);
  const t=getOpt("bath","toilet",sel.toilet), sh=getOpt("bath","shower",sel.shower);
  const T="all 0.5s ease";
  return <div style={{width:"100%",height:"100%",position:"relative",overflow:"hidden",background:`linear-gradient(180deg,#f0ede8 0%,${w?.color} 18%,${w?.color} 58%,${f?.color} 58%,${f?.color} 100%)`,transition:T}}>
    <div style={{position:"absolute",top:0,left:0,right:0,height:"15%",background:"#f0ede8"}}>
      <div style={{position:"absolute",bottom:0,left:"15%",right:"15%",height:2,background:"linear-gradient(90deg,transparent,#fff8e720,transparent)"}}/>
    </div>
    <div style={{position:"absolute",top:"15%",left:0,right:0,bottom:"42%",background:w?.color,transition:T}}>
      {w?.pat==="glossy"&&<div style={{position:"absolute",inset:0,background:"linear-gradient(135deg,rgba(255,255,255,0.08),transparent 40%)"}}/>}
      {w?.pat==="concrete"&&<div style={{position:"absolute",inset:0,opacity:0.04,background:"radial-gradient(circle at 30% 40%,rgba(0,0,0,0.1),transparent 50%)"}}/>}
    </div>
    <div style={{position:"absolute",top:"20%",right:"8%",width:"22%",height:"35%",background:"rgba(200,220,235,0.15)",borderRadius:4,border:"2px solid rgba(200,220,235,0.2)"}}>
      <div style={{position:"absolute",top:8,left:"50%",transform:"translateX(-50%)",width:14,height:14,borderRadius:"50%",background:sh?.color,transition:T,boxShadow:`0 0 8px ${sh?.accent}40`}}/>
      <div style={{position:"absolute",top:22,left:"50%",width:1,height:"50%",background:"rgba(0,0,0,0.06)"}}/>
      <div style={{position:"absolute",bottom:"15%",left:"20%",right:"20%",height:1,background:"rgba(0,0,0,0.06)"}}/>
    </div>
    <div style={{position:"absolute",bottom:"42%",left:"8%",width:"28%",height:"12%",background:v?.color,transition:T,borderRadius:"4px 4px 0 0",boxShadow:"0 -2px 10px rgba(0,0,0,0.06)"}}>
      <div style={{position:"absolute",top:0,left:"25%",width:"50%",height:"40%",background:"rgba(255,255,255,0.15)",borderRadius:"0 0 50% 50%"}}/>
      {v?.pat==="wood"&&<div style={{position:"absolute",inset:0,borderRadius:"inherit",opacity:0.08,background:"repeating-linear-gradient(90deg,transparent,transparent 8px,rgba(0,0,0,0.04) 8px,rgba(0,0,0,0.04) 9px)"}}/>}
    </div>
    <div style={{position:"absolute",top:"22%",left:"10%",width:"24%",height:"18%",border:"2px solid rgba(0,0,0,0.05)",borderRadius:3,background:"linear-gradient(135deg,rgba(200,210,220,0.15),rgba(180,190,200,0.1))"}}>
      <div style={{position:"absolute",inset:"8%",border:"1px solid rgba(0,0,0,0.03)",borderRadius:2}}/>
    </div>
    <div style={{position:"absolute",bottom:"24%",left:"45%",width:"18%",height:"18%",transition:T}}>
      <div style={{width:"100%",height:"75%",background:t?.color,borderRadius:"6px 6px 3px 3px",transition:T,boxShadow:"0 2px 10px rgba(0,0,0,0.06)"}}>
        {t?.pat==="smart"&&<div style={{position:"absolute",top:"8%",right:"8%",width:6,height:6,borderRadius:"50%",background:"rgba(45,212,168,0.4)"}}/>}
      </div>
      <div style={{width:"80%",height:"30%",background:t?.color,borderRadius:"0 0 4px 4px",margin:"-2px auto 0",transition:T,filter:"brightness(0.97)"}}/>
    </div>
    <div style={{position:"absolute",left:0,right:0,bottom:0,height:"22%",background:f?.color,transition:T}}>
      {f?.pat==="tile"&&<div style={{position:"absolute",inset:0,opacity:0.12}}>{[...Array(6)].map((_,i)=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*18}%`,height:1,background:"rgba(0,0,0,0.35)"}}/>)}{[...Array(8)].map((_,i)=><div key={`v${i}`} style={{position:"absolute",top:0,bottom:0,left:`${i*13}%`,width:1,background:"rgba(0,0,0,0.35)"}}/>)}</div>}
      {f?.pat==="terrazzo"&&<div style={{position:"absolute",inset:0,opacity:0.2}}>{[...Array(20)].map((_,i)=><div key={i} style={{position:"absolute",left:`${(i*43+11)%90}%`,top:`${(i*51+9)%85}%`,width:3+i%4,height:3+i%4,borderRadius:"40%",background:["#888","#aaa","#777","#bbb"][i%4]}}/>)}</div>}
      {f?.pat==="wood"&&<div style={{position:"absolute",inset:0,opacity:0.1}}>{[...Array(10)].map((_,i)=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*10}%`,height:1,background:"rgba(0,0,0,0.2)"}}/>)}</div>}
    </div>
  </div>;
}

function StudyScene({ sel }) {
  const f=getOpt("study","floor",sel.floor), w=getOpt("study","wall",sel.wall), bk=getOpt("study","bookwall",sel.bookwall);
  const dk=getOpt("study","desk",sel.desk), li=getOpt("study","light",sel.light);
  const T="all 0.5s ease";
  return <div style={{width:"100%",height:"100%",position:"relative",overflow:"hidden",background:`linear-gradient(180deg,#f5f2ee 0%,${w?.color} 20%,${w?.color} 60%,${f?.color} 60%,${f?.color} 100%)`,transition:T}}>
    <div style={{position:"absolute",top:0,left:0,right:0,height:"17%",background:"#f5f2ee"}}>
      {li?.pat==="track"&&<div style={{position:"absolute",bottom:5,left:"15%",right:"15%",height:3,background:"#333",borderRadius:2}}>{[0,1,2].map(i=><div key={i} style={{position:"absolute",top:-3,left:`${20+i*30}%`,width:10,height:10,borderRadius:"50%",background:"#444",boxShadow:"0 4px 10px #fff8e720"}}/>)}</div>}
      {li?.pat==="woodpendant"&&<div style={{position:"absolute",bottom:-30,left:"50%",transform:"translateX(-50%)"}}><div style={{width:1,height:20,background:"#555",margin:"0 auto"}}/><div style={{width:40,height:20,borderRadius:"50% 50% 0 0",background:li.accent,margin:"0 auto"}}/>
      </div>}
      {li?.pat==="flush"&&<div style={{position:"absolute",bottom:0,left:"35%",right:"35%",height:8,background:li.color,borderRadius:"0 0 50% 50%",boxShadow:`0 4px 15px ${li.accent}20`}}/>}
    </div>
    <div style={{position:"absolute",top:"17%",left:0,width:"16%",bottom:"40%",background:w?.color,transition:T,transform:"perspective(800px) rotateY(5deg)",transformOrigin:"right center"}}>
      <div style={{position:"absolute",top:"10%",left:"15%",width:"70%",height:"55%",border:"2px solid rgba(0,0,0,0.05)",background:"linear-gradient(135deg,#d8e4ee,#c0d0e0)"}}/>
    </div>
    <div style={{position:"absolute",top:"17%",right:0,width:"22%",bottom:"40%",background:bk?.color,transition:T,transform:"perspective(800px) rotateY(-4deg)",transformOrigin:"left center",borderRadius:2}}>
      {bk?.pat==="walnut"&&<>{[0,1,2,3,4].map(i=><div key={i} style={{position:"absolute",left:"5%",right:"5%",top:`${8+i*18}%`,height:"14%",background:`rgba(255,255,255,${0.03+i*0.01})`,borderRadius:2}}>{[0,1,2].map(j=><div key={j} style={{position:"absolute",left:`${10+j*30}%`,top:"15%",width:"20%",height:"70%",background:[bk.accent,"#8a7a6a","#6a5a4a"][j],borderRadius:1,opacity:0.5+j*0.1}}/>)}</div>)}</>}
      {bk?.pat==="white"&&<>{[0,1,2,3,4].map(i=><div key={i} style={{position:"absolute",left:"5%",right:"5%",top:`${6+i*18}%`,height:"14%",borderBottom:"2px solid rgba(0,0,0,0.04)"}}>
        {[0,1,2,3].map(j=><div key={j} style={{position:"absolute",left:`${5+j*24}%`,top:"10%",width:"18%",height:"80%",background:["#d4c5a9","#a8b8c8","#c8a8a8","#b8c8a8"][j],borderRadius:1,opacity:0.35}}/>)}
      </div>)}</>}
      {bk?.pat==="metal"&&<>{[0,1,2,3].map(i=><div key={i} style={{position:"absolute",left:"3%",right:"3%",top:`${10+i*22}%`,height:"16%",borderBottom:`2px solid ${bk.accent}40`,background:"rgba(255,255,255,0.02)"}}>
        {[0,1,2].map(j=><div key={j} style={{position:"absolute",left:`${8+j*30}%`,top:"10%",width:"22%",height:"80%",background:["#8b7355","#6a7a8a","#9a8a7a"][j],borderRadius:1,opacity:0.4}}/>)}
      </div>)}</>}
    </div>
    <div style={{position:"absolute",top:"17%",left:"16%",right:"22%",bottom:"40%",background:w?.color,transition:T}}>
      {w?.pat==="woodpanel"&&<div style={{position:"absolute",inset:0,opacity:0.08,background:"repeating-linear-gradient(90deg,transparent,transparent 15px,rgba(0,0,0,0.03) 15px,rgba(0,0,0,0.03) 16px)"}}/>}
    </div>
    <div style={{position:"absolute",left:0,right:0,bottom:0,height:"40%",background:f?.color,transition:T,transform:"perspective(500px) rotateX(3deg)",transformOrigin:"top center"}}>
      {f?.pat==="wood"&&<div style={{position:"absolute",inset:0,opacity:0.12}}>{[...Array(16)].map((_,i)=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*6.5}%`,height:1,background:`rgba(0,0,0,${0.12+i%3*0.08})`}}/>)}</div>}
      {f?.pat==="herringbone"&&<div style={{position:"absolute",inset:0,opacity:0.08,background:"repeating-linear-gradient(45deg,transparent,transparent 8px,rgba(0,0,0,0.04) 8px,rgba(0,0,0,0.04) 9px),repeating-linear-gradient(-45deg,transparent,transparent 8px,rgba(0,0,0,0.04) 8px,rgba(0,0,0,0.04) 9px)"}}/>}
      {f?.pat==="tile"&&<div style={{position:"absolute",inset:0,opacity:0.08}}>{[...Array(7)].map((_,i)=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*15}%`,height:1,background:"rgba(0,0,0,0.3)"}}/>)}</div>}
    </div>
    <div style={{position:"absolute",bottom:"26%",left:"25%",right:"30%",height:"5%",background:dk?.color,transition:T,borderRadius:3,boxShadow:"0 3px 12px rgba(0,0,0,0.1)"}}>
      {dk?.pat==="standing"&&<div style={{position:"absolute",bottom:-20,left:"15%",width:4,height:20,background:dk.accent,borderRadius:2}}>
      </div>}
      <div style={{position:"absolute",top:"15%",left:"60%",width:"10%",height:"60%",background:"rgba(0,0,0,0.15)",borderRadius:2}}/>
      <div style={{position:"absolute",top:"10%",left:"20%",width:"15%",height:"40%",background:"rgba(0,0,0,0.08)",borderRadius:1}}/>
    </div>
    <div style={{position:"absolute",bottom:"30%",left:"35%",width:"16%",height:"14%"}}>
      <div style={{width:"100%",height:"40%",background:"rgba(80,70,60,0.5)",borderRadius:"4px 4px 0 0"}}/>
      <div style={{width:"80%",height:"60%",background:"rgba(80,70,60,0.35)",margin:"0 auto",borderRadius:"0 0 3px 3px"}}/>
    </div>
  </div>;
}

const SCENE_MAP = { living: LivingScene, master: BedroomScene, kitchen: KitchenScene, bath: BathScene, study: StudyScene };

function OrderModal({ allSel, activeRoom, onClose }) {
  const roomData = ROOM_DATA[activeRoom];
  const sel = allSel[activeRoom];
  const items = Object.entries(sel).map(([c,o])=>{const cat=roomData.categories.find(x=>x.id===c);const opt=cat?.options.find(x=>x.id===o);return opt?{catName:cat.name,...opt}:null;}).filter(Boolean);
  const roomTotal = items.reduce((s,i)=>s+i.price*i.qty,0);
  const grandTotal = ROOM_ORDER.reduce((s,r)=>s+calcRoomTotal(r,allSel[r]),0);
  return (
    <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:"fixed",inset:0,zIndex:100,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(12px)",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:"92%",maxWidth:500,maxHeight:"85vh",background:"#141a18",borderRadius:18,border:"1px solid rgba(45,212,168,0.12)",overflow:"hidden",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"18px 22px 14px",borderBottom:"1px solid rgba(255,255,255,0.05)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:17,fontWeight:700,color:"#fff"}}>选配清单 · {roomData.name}</div><div style={{fontSize:11,color:"rgba(255,255,255,0.35)",marginTop:3}}>贵阳远洋天铂 · A2户型 · 138㎡</div></div>
          <button onClick={onClose} style={{width:30,height:30,borderRadius:"50%",background:"rgba(255,255,255,0.05)",border:"none",color:"rgba(255,255,255,0.4)",fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"8px 22px"}}>
          {items.map((item,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 0",borderBottom:i<items.length-1?"1px solid rgba(255,255,255,0.04)":"none"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:34,height:34,borderRadius:7,background:item.color,border:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}/>
                <div>
                  <div style={{fontSize:12.5,fontWeight:500,color:"rgba(255,255,255,0.85)"}}><span style={{color:"rgba(255,255,255,0.3)",marginRight:5,fontSize:10.5}}>{item.catName}</span>{item.name}</div>
                  <div style={{fontSize:10.5,color:"rgba(255,255,255,0.3)",marginTop:2}}>{item.brand} · {item.model} · ×{item.qty}{item.unit}</div>
                </div>
              </div>
              <div style={{fontSize:13.5,fontWeight:700,color:"#fff",fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}}>¥{fmt(item.price*item.qty)}</div>
            </div>
          ))}
        </div>
        <div style={{padding:"14px 22px 18px",borderTop:"1px solid rgba(255,255,255,0.05)",background:"rgba(45,212,168,0.02)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
            <span style={{fontSize:12,color:"rgba(255,255,255,0.35)"}}>{roomData.name}小计</span>
            <span style={{fontSize:20,fontWeight:700,color:"#fff",fontVariantNumeric:"tabular-nums"}}>¥{fmt(roomTotal)}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:14}}>
            <span style={{fontSize:13,color:"rgba(255,255,255,0.5)"}}>全屋总计（5间）</span>
            <span style={{fontSize:26,fontWeight:800,color:"#2dd4a8",fontVariantNumeric:"tabular-nums"}}>¥{fmt(grandTotal)}</span>
          </div>
          <button style={{width:"100%",padding:"13px 0",borderRadius:11,background:"linear-gradient(135deg,#2dd4a8,#1ab894)",border:"none",color:"#0a0f0d",fontSize:14.5,fontWeight:700,cursor:"pointer",letterSpacing:2}}>确认方案 · 生成施工工单</button>
          <p style={{textAlign:"center",marginTop:7,marginBottom:0,fontSize:10.5,color:"rgba(255,255,255,0.2)"}}>确认后将自动生成材料采购单、施工工序及验收标准</p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [activeRoom, setActiveRoom] = useState("living");
  const [allSel, setAllSel] = useState(() => {
    const s = {};
    ROOM_ORDER.forEach(r => { s[r] = { ...ROOM_DATA[r].defaults }; });
    return s;
  });
  const [activeCat, setActiveCat] = useState(() => ROOM_DATA.living.categories[0].id);
  const [showOrder, setShowOrder] = useState(false);
  const [showPanel, setShowPanel] = useState(true);

  const roomData = ROOM_DATA[activeRoom];
  const sel = allSel[activeRoom];
  const cat = roomData.categories.find(c => c.id === activeCat);
  const grandTotal = ROOM_ORDER.reduce((s, r) => s + calcRoomTotal(r, allSel[r]), 0);

  const SceneComp = SCENE_MAP[activeRoom];

  const switchRoom = (roomId) => {
    setActiveRoom(roomId);
    setActiveCat(ROOM_DATA[roomId].categories[0].id);
  };

  const updateSel = (optId) => {
    setAllSel(prev => ({ ...prev, [activeRoom]: { ...prev[activeRoom], [activeCat]: optId } }));
  };

  return (
    <div style={{width:"100%",height:"100vh",display:"flex",flexDirection:"column",background:"#0a0f0d",overflow:"hidden",position:"relative",fontFamily:"'Noto Sans SC',-apple-system,sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0}::-webkit-scrollbar{height:3px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:3px}`}</style>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",position:"absolute",top:0,left:0,right:0,zIndex:10,background:"linear-gradient(180deg,rgba(10,15,13,0.85),transparent)"}}>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <div style={{width:30,height:30,borderRadius:7,background:"linear-gradient(135deg,#2dd4a8,#1ab894)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#0a0f0d"}}>狸</div>
          <div>
            <div style={{fontSize:12.5,fontWeight:600,color:"#fff",lineHeight:1.2}}>河狸云 · 个性化精装</div>
            <div style={{fontSize:9.5,color:"rgba(255,255,255,0.3)"}}>贵阳远洋天铂 · A2户型 · 138㎡</div>
          </div>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>setShowPanel(!showPanel)} style={{padding:"5px 12px",borderRadius:7,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.07)",color:"rgba(255,255,255,0.55)",fontSize:11,cursor:"pointer"}}>{showPanel?"隐藏":"选配"}</button>
          <button onClick={()=>setShowOrder(true)} style={{padding:"5px 12px",borderRadius:7,background:"rgba(45,212,168,0.12)",border:"1px solid rgba(45,212,168,0.25)",color:"#2dd4a8",fontSize:11,fontWeight:600,cursor:"pointer"}}>清单 ¥{fmt(grandTotal)}</button>
        </div>
      </div>

      <div style={{flex:1}}><SceneComp sel={sel}/></div>

      <div style={{position:"absolute",top:14,left:"50%",transform:"translateX(-50%)",background:"rgba(0,0,0,0.45)",backdropFilter:"blur(10px)",padding:"5px 18px",borderRadius:18,color:"white",fontSize:12,fontWeight:500,letterSpacing:4,zIndex:8}}>{roomData.label}</div>

      <div style={{position:"absolute",bottom:showPanel?195:14,left:"50%",transform:"translateX(-50%)",zIndex:10,display:"flex",gap:4,padding:5,background:"rgba(0,0,0,0.45)",backdropFilter:"blur(10px)",borderRadius:10,transition:"bottom 0.3s ease"}}>
        {ROOM_ORDER.map(r=><button key={r} onClick={()=>switchRoom(r)} style={{padding:"5px 14px",borderRadius:7,background:activeRoom===r?"rgba(45,212,168,0.18)":"transparent",border:activeRoom===r?"1px solid rgba(45,212,168,0.35)":"1px solid transparent",color:activeRoom===r?"#2dd4a8":"rgba(255,255,255,0.35)",fontSize:11,fontWeight:activeRoom===r?600:400,cursor:"pointer",opacity:activeRoom===r?1:0.55}}>{ROOM_DATA[r].name}</button>)}
      </div>

      {showPanel && (
        <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(180deg,rgba(10,15,13,0.8),rgba(10,15,13,0.97) 35%)",backdropFilter:"blur(18px)",padding:"10px 14px 14px",borderTop:"1px solid rgba(255,255,255,0.05)",zIndex:5}}>
          <div style={{display:"flex",gap:4,paddingBottom:8,overflowX:"auto"}}>
            {roomData.categories.map(c=>(
              <button key={c.id} onClick={()=>setActiveCat(c.id)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"6px 13px",borderRadius:9,border:activeCat===c.id?"1.5px solid #2dd4a8":"1.5px solid rgba(255,255,255,0.06)",background:activeCat===c.id?"rgba(45,212,168,0.08)":"rgba(255,255,255,0.02)",color:activeCat===c.id?"#2dd4a8":"rgba(255,255,255,0.5)",cursor:"pointer",whiteSpace:"nowrap",fontSize:11}}>
                <span style={{fontSize:16}}>{c.icon}</span><span style={{fontWeight:500}}>{c.name}</span>
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:7,overflowX:"auto",paddingBottom:4}}>
            {cat?.options.map(opt=>{
              const on=sel[activeCat]===opt.id;
              return(
                <button key={opt.id} onClick={()=>updateSel(opt.id)} style={{flex:"0 0 auto",width:122,padding:9,borderRadius:11,border:on?"2px solid #2dd4a8":"2px solid rgba(255,255,255,0.05)",background:on?"rgba(45,212,168,0.06)":"rgba(255,255,255,0.015)",cursor:"pointer",textAlign:"left",position:"relative",overflow:"hidden"}}>
                  <div style={{width:"100%",height:36,borderRadius:5,marginBottom:7,background:opt.color,border:"1px solid rgba(0,0,0,0.06)",position:"relative",overflow:"hidden"}}>
                    {opt.pat==="wood"&&<div style={{position:"absolute",inset:0,opacity:0.18,background:`repeating-linear-gradient(0deg,transparent,transparent 3px,${opt.accent} 3px,${opt.accent} 4px)`}}/>}
                    {opt.pat==="marble"&&<svg style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.18}} viewBox="0 0 122 36"><path d="M0,12 Q30,4 60,16 T122,12" stroke={opt.accent} strokeWidth="1" fill="none"/></svg>}
                    {opt.pat==="terrazzo"&&<div style={{position:"absolute",inset:0}}>{[...Array(7)].map((_,i)=><div key={i} style={{position:"absolute",left:`${(i*31+8)%82}%`,top:`${(i*41+12)%65}%`,width:3+i%3*1.5,height:3+i%3*1.5,borderRadius:"40%",background:"#888",opacity:0.28}}/>)}</div>}
                    {opt.pat==="herringbone"&&<div style={{position:"absolute",inset:0,opacity:0.15,background:"repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(0,0,0,0.08) 4px,rgba(0,0,0,0.08) 5px)"}}/>}
                  </div>
                  <div style={{fontSize:11.5,fontWeight:600,color:on?"#2dd4a8":"rgba(255,255,255,0.8)",marginBottom:2,lineHeight:1.3}}>{opt.name}</div>
                  <div style={{fontSize:9.5,color:"rgba(255,255,255,0.35)"}}>{opt.brand} · {opt.model}</div>
                  <div style={{fontSize:11.5,fontWeight:700,color:on?"#2dd4a8":"rgba(255,255,255,0.55)",marginTop:3,fontVariantNumeric:"tabular-nums"}}>¥{fmt(opt.price)}<span style={{fontSize:9.5,fontWeight:400}}>/{opt.unit}</span></div>
                  {on&&<div style={{position:"absolute",top:5,right:5,width:16,height:16,borderRadius:"50%",background:"#2dd4a8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#0a0f0d"}}>✓</div>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {showOrder&&<OrderModal allSel={allSel} activeRoom={activeRoom} onClose={()=>setShowOrder(false)}/>}
    </div>
  );
}
