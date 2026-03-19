import { useState } from "react";

/* ================================================================
   河狸云 · 个性化精装选配系统 Demo（五房间完整版）
   客厅 / 主卧 / 厨房 / 卫生间 / 书房
   ================================================================ */

// ── Room definitions with categories & options ──
const ROOM_DATA = {
  living: {
    name: "客厅", label: "客 厅", area: 35,
    cats: [
      { id: "floor", name: "地面", icon: "◫", opts: [
        { id: "lf1", name: "爵士白大理石", brand: "诺贝尔", model: "W63012", price: 428, unit: "㎡", qty: 35, color: "#e8e4df", accent: "#d4cfc8", pat: "marble" },
        { id: "lf2", name: "北美白橡木地板", brand: "大自然", model: "DSQ001", price: 368, unit: "㎡", qty: 35, color: "#c4a97d", accent: "#b89968", pat: "wood" },
        { id: "lf3", name: "莫兰迪灰瓷砖", brand: "马可波罗", model: "FG8025", price: 298, unit: "㎡", qty: 35, color: "#a8a09a", accent: "#9b938d", pat: "tile" },
        { id: "lf4", name: "水磨石", brand: "蒙娜丽莎", model: "TS6601", price: 358, unit: "㎡", qty: 35, color: "#d6d0c8", accent: "#bfb8ae", pat: "terrazzo" },
      ]},
      { id: "wall", name: "墙面", icon: "▦", opts: [
        { id: "lw1", name: "云白乳胶漆", brand: "多乐士", model: "A991", price: 65, unit: "㎡", qty: 82, color: "#f5f2ee", accent: "#f5f2ee", pat: "solid" },
        { id: "lw2", name: "暖灰微水泥", brand: "磐多魔", model: "MC-G03", price: 320, unit: "㎡", qty: 82, color: "#c8c0b8", accent: "#bdb5ac", pat: "concrete" },
        { id: "lw3", name: "白栎木饰面", brand: "科定", model: "KD-S12", price: 480, unit: "㎡", qty: 82, color: "#d4c5a9", accent: "#c9ba9a", pat: "woodpanel" },
        { id: "lw4", name: "鼠尾草绿", brand: "本杰明摩尔", model: "HC-114", price: 88, unit: "㎡", qty: 82, color: "#b5bfa8", accent: "#a8b29b", pat: "solid" },
      ]},
      { id: "tvwall", name: "背景墙", icon: "▣", opts: [
        { id: "lt1", name: "岩板一体背景", brand: "德利丰", model: "YB-8201", price: 12800, unit: "套", qty: 1, color: "#6b6560", accent: "#5c5650", pat: "slate" },
        { id: "lt2", name: "黑胡桃木格栅", brand: "科定", model: "KD-TV06", price: 8600, unit: "套", qty: 1, color: "#5c4a3a", accent: "#4d3d2e", pat: "slat" },
        { id: "lt3", name: "大理石+金属", brand: "诺贝尔", model: "TV-M01", price: 15800, unit: "套", qty: 1, color: "#ddd8d0", accent: "#c5a86c", pat: "marblemetal" },
        { id: "lt4", name: "极简石膏板", brand: "可耐福", model: "GK-S01", price: 4200, unit: "套", qty: 1, color: "#ebe8e4", accent: "#ddd9d4", pat: "minimal" },
      ]},
      { id: "sofa", name: "沙发", icon: "⊏", opts: [
        { id: "ls1", name: "烟灰L型布艺", brand: "HAY", model: "MAGS-L", price: 28600, unit: "套", qty: 1, color: "#8a8580", accent: "#7d7873", pat: "fabric" },
        { id: "ls2", name: "奶油白意式真皮", brand: "Natuzzi", model: "IAGO", price: 42000, unit: "套", qty: 1, color: "#ede5d8", accent: "#e0d8ca", pat: "leather" },
        { id: "ls3", name: "复古绿丝绒", brand: "Cassina", model: "MARA", price: 56000, unit: "套", qty: 1, color: "#5a7a62", accent: "#4d6b54", pat: "velvet" },
      ]},
      { id: "light", name: "主灯", icon: "◉", opts: [
        { id: "ll1", name: "无主灯设计", brand: "三雄极光", model: "NL-S01", price: 6800, unit: "套", qty: 1, color: "#fff8e7", accent: "#fff3d4", pat: "recessed" },
        { id: "ll2", name: "黄铜球形吊灯", brand: "FLOS", model: "IC-S2", price: 12800, unit: "套", qty: 1, color: "#c5a86c", accent: "#b89755", pat: "pendant" },
        { id: "ll3", name: "极简线性灯", brand: "VIBIA", model: "HALO", price: 8900, unit: "套", qty: 1, color: "#f0ede8", accent: "#fff8e7", pat: "linear" },
      ]},
    ],
    defaults: { floor: "lf1", wall: "lw1", tvwall: "lt1", sofa: "ls1", light: "ll1" },
  },
  master: {
    name: "主卧", label: "主 卧", area: 22,
    cats: [
      { id: "floor", name: "地面", icon: "◫", opts: [
        { id: "mf1", name: "胡桃木实木地板", brand: "大自然", model: "TB801", price: 520, unit: "㎡", qty: 22, color: "#8b7355", accent: "#7a6348", pat: "wood" },
        { id: "mf2", name: "浅灰橡木地板", brand: "圣象", model: "NK1006", price: 398, unit: "㎡", qty: 22, color: "#beb5a8", accent: "#b0a79a", pat: "wood" },
        { id: "mf3", name: "奶油白鱼骨拼", brand: "必美", model: "HB220", price: 680, unit: "㎡", qty: 22, color: "#e2dace", accent: "#d5ccbf", pat: "herring" },
      ]},
      { id: "wall", name: "墙面", icon: "▦", opts: [
        { id: "mw1", name: "暖白乳胶漆", brand: "多乐士", model: "A970", price: 65, unit: "㎡", qty: 58, color: "#f8f4ef", accent: "#f8f4ef", pat: "solid" },
        { id: "mw2", name: "浅杏色艺术漆", brand: "NOVACOLOR", model: "ART-A02", price: 280, unit: "㎡", qty: 58, color: "#e8d8c8", accent: "#deccba", pat: "solid" },
        { id: "mw3", name: "烟灰蓝乳胶漆", brand: "本杰明摩尔", model: "HC-153", price: 88, unit: "㎡", qty: 58, color: "#b0b8c2", accent: "#a4acb6", pat: "solid" },
      ]},
      { id: "bedhead", name: "床头背景", icon: "▣", opts: [
        { id: "mb1", name: "皮革软包", brand: "慕思", model: "BG-L01", price: 6800, unit: "套", qty: 1, color: "#c8b8a0", accent: "#baa88e", pat: "leather-pad" },
        { id: "mb2", name: "木饰面+灯带", brand: "科定", model: "BG-W02", price: 8200, unit: "套", qty: 1, color: "#8b7355", accent: "#fff8e7", pat: "wood-light" },
        { id: "mb3", name: "艺术涂料+线条", brand: "NOVACOLOR", model: "BG-A03", price: 5600, unit: "套", qty: 1, color: "#d4c8b8", accent: "#c5b9a8", pat: "art-line" },
      ]},
      { id: "bed", name: "床", icon: "⊏", opts: [
        { id: "mbd1", name: "布艺软包大床", brand: "慕思", model: "V6-S01", price: 15800, unit: "套", qty: 1, color: "#a8a098", accent: "#9a928a", pat: "fabric" },
        { id: "mbd2", name: "真皮意式大床", brand: "Natuzzi", model: "PIUMA", price: 32000, unit: "套", qty: 1, color: "#d8cfc2", accent: "#ccc3b5", pat: "leather" },
        { id: "mbd3", name: "黑胡桃实木床", brand: "半木", model: "WB-01", price: 26800, unit: "套", qty: 1, color: "#5c4a3a", accent: "#c8b8a0", pat: "woodframe" },
      ]},
      { id: "light", name: "主灯", icon: "◉", opts: [
        { id: "ml1", name: "无主灯+筒灯", brand: "欧普", model: "NL-B01", price: 4200, unit: "套", qty: 1, color: "#fff8e7", accent: "#fff3d4", pat: "recessed" },
        { id: "ml2", name: "月球吊灯", brand: "FLOS", model: "MOON-40", price: 8600, unit: "套", qty: 1, color: "#f0e8d8", accent: "#e8dcc8", pat: "pendant" },
      ]},
    ],
    defaults: { floor: "mf1", wall: "mw1", bedhead: "mb1", bed: "mbd1", light: "ml1" },
  },
  kitchen: {
    name: "厨房", label: "厨 房", area: 8,
    cats: [
      { id: "floor", name: "地砖", icon: "◫", opts: [
        { id: "kf1", name: "浅灰防滑砖", brand: "马可波罗", model: "KF-G01", price: 198, unit: "㎡", qty: 8, color: "#b8b2ac", accent: "#aaa49e", pat: "tile" },
        { id: "kf2", name: "暖白哑光砖", brand: "诺贝尔", model: "KF-W02", price: 228, unit: "㎡", qty: 8, color: "#e8e2da", accent: "#ddd7cf", pat: "tile" },
        { id: "kf3", name: "水泥灰质感砖", brand: "蒙娜丽莎", model: "KF-C03", price: 268, unit: "㎡", qty: 8, color: "#a09890", accent: "#958d85", pat: "concrete" },
      ]},
      { id: "wall", name: "墙砖", icon: "▦", opts: [
        { id: "kw1", name: "亮白釉面砖", brand: "马可波罗", model: "KW-W01", price: 168, unit: "㎡", qty: 18, color: "#f2efeb", accent: "#e8e5e0", pat: "tile" },
        { id: "kw2", name: "小白砖(工字铺)", brand: "诺贝尔", model: "KW-S02", price: 208, unit: "㎡", qty: 18, color: "#f5f2ee", accent: "#ebe8e3", pat: "subway" },
        { id: "kw3", name: "灰色肌理砖", brand: "蒙娜丽莎", model: "KW-T03", price: 238, unit: "㎡", qty: 18, color: "#ccc6be", accent: "#c0bab2", pat: "concrete" },
      ]},
      { id: "cabinet", name: "橱柜", icon: "⊡", opts: [
        { id: "kc1", name: "云白哑光门板", brand: "欧派", model: "CB-W01", price: 2680, unit: "延米", qty: 5, color: "#f0ece6", accent: "#e5e0d9", pat: "flat" },
        { id: "kc2", name: "浅木纹门板", brand: "金牌", model: "CB-N02", price: 2280, unit: "延米", qty: 5, color: "#c4aa82", accent: "#b89a72", pat: "wood" },
        { id: "kc3", name: "深灰烤漆门板", brand: "欧派", model: "CB-G03", price: 2980, unit: "延米", qty: 5, color: "#5a5550", accent: "#4d4844", pat: "gloss" },
      ]},
      { id: "counter", name: "台面", icon: "▣", opts: [
        { id: "kt1", name: "雪花白石英石", brand: "赛凯隆", model: "QZ-W01", price: 1880, unit: "延米", qty: 5, color: "#f0ece8", accent: "#e2ddd8", pat: "quartz" },
        { id: "kt2", name: "岩板台面(灰)", brand: "德利丰", model: "QZ-S02", price: 2680, unit: "延米", qty: 5, color: "#8a8480", accent: "#7d7773", pat: "slate" },
        { id: "kt3", name: "不锈钢台面", brand: "欧琳", model: "SS-01", price: 1580, unit: "延米", qty: 5, color: "#c0bdb8", accent: "#d8d5d0", pat: "steel" },
      ]},
    ],
    defaults: { floor: "kf1", wall: "kw1", cabinet: "kc1", counter: "kt1" },
  },
  bath: {
    name: "卫生间", label: "卫生间", area: 6,
    cats: [
      { id: "floor", name: "地砖", icon: "◫", opts: [
        { id: "bf1", name: "浅灰防滑砖", brand: "马可波罗", model: "BF-G01", price: 228, unit: "㎡", qty: 6, color: "#b0aaa4", accent: "#a4a09a", pat: "tile" },
        { id: "bf2", name: "木纹砖", brand: "诺贝尔", model: "BF-W02", price: 268, unit: "㎡", qty: 6, color: "#b8a488", accent: "#aa9678", pat: "wood" },
        { id: "bf3", name: "六角小花砖", brand: "蒙娜丽莎", model: "BF-H03", price: 328, unit: "㎡", qty: 6, color: "#c8c2b8", accent: "#a8a298", pat: "hex" },
      ]},
      { id: "wall", name: "墙砖", icon: "▦", opts: [
        { id: "bw1", name: "亮白大板砖", brand: "马可波罗", model: "BW-W01", price: 198, unit: "㎡", qty: 20, color: "#f2efeb", accent: "#e8e4df", pat: "tile" },
        { id: "bw2", name: "浅灰微水泥砖", brand: "蒙娜丽莎", model: "BW-C02", price: 288, unit: "㎡", qty: 20, color: "#c5bfb8", accent: "#bab4ac", pat: "concrete" },
        { id: "bw3", name: "绿色手工砖", brand: "进口", model: "BW-G03", price: 480, unit: "㎡", qty: 20, color: "#8aaa90", accent: "#7a9a80", pat: "solid" },
      ]},
      { id: "vanity", name: "浴室柜", icon: "⊡", opts: [
        { id: "bv1", name: "白色悬浮浴室柜", brand: "TOTO", model: "VC-W01", price: 6800, unit: "套", qty: 1, color: "#f0ece6", accent: "#e5e0d8", pat: "flat" },
        { id: "bv2", name: "木纹岩板浴室柜", brand: "科勒", model: "VC-N02", price: 8800, unit: "套", qty: 1, color: "#8b7a62", accent: "#7d6c55", pat: "wood" },
        { id: "bv3", name: "深灰智能浴室柜", brand: "恒洁", model: "VC-G03", price: 7200, unit: "套", qty: 1, color: "#5a5550", accent: "#4d4844", pat: "dark" },
      ]},
      { id: "shower", name: "淋浴", icon: "◉", opts: [
        { id: "bs1", name: "恒温花洒套装", brand: "汉斯格雅", model: "SR-T01", price: 5800, unit: "套", qty: 1, color: "#c0bdb8", accent: "#d5d2cd", pat: "chrome" },
        { id: "bs2", name: "黑色顶喷套装", brand: "科勒", model: "SR-B02", price: 4200, unit: "套", qty: 1, color: "#3a3835", accent: "#2d2b28", pat: "black" },
        { id: "bs3", name: "金色轻奢套装", brand: "AXOR", model: "SR-G03", price: 12800, unit: "套", qty: 1, color: "#c5a86c", accent: "#b89755", pat: "gold" },
      ]},
    ],
    defaults: { floor: "bf1", wall: "bw1", vanity: "bv1", shower: "bs1" },
  },
  study: {
    name: "书房", label: "书 房", area: 12,
    cats: [
      { id: "floor", name: "地面", icon: "◫", opts: [
        { id: "sf1", name: "深色橡木地板", brand: "圣象", model: "SF-D01", price: 458, unit: "㎡", qty: 12, color: "#8a7660", accent: "#7c6852", pat: "wood" },
        { id: "sf2", name: "浅灰瓷砖", brand: "马可波罗", model: "SF-G02", price: 258, unit: "㎡", qty: 12, color: "#b5afa8", accent: "#a8a29c", pat: "tile" },
        { id: "sf3", name: "人字拼地板", brand: "必美", model: "SF-H03", price: 620, unit: "㎡", qty: 12, color: "#b09878", accent: "#a28a6a", pat: "herring" },
      ]},
      { id: "wall", name: "墙面", icon: "▦", opts: [
        { id: "sw1", name: "暖白乳胶漆", brand: "多乐士", model: "A970", price: 65, unit: "㎡", qty: 40, color: "#f5f2ee", accent: "#f5f2ee", pat: "solid" },
        { id: "sw2", name: "深蓝灰乳胶漆", brand: "本杰明摩尔", model: "HC-157", price: 88, unit: "㎡", qty: 40, color: "#6a7580", accent: "#5e6970", pat: "solid" },
        { id: "sw3", name: "木饰面护墙板", brand: "科定", model: "WP-W03", price: 520, unit: "㎡", qty: 40, color: "#a08868", accent: "#927a5a", pat: "woodpanel" },
      ]},
      { id: "bookshelf", name: "书柜", icon: "▣", opts: [
        { id: "sb1", name: "白色开放式书柜", brand: "宜家", model: "BILLY", price: 4800, unit: "套", qty: 1, color: "#f0ece6", accent: "#e5e0d8", pat: "white" },
        { id: "sb2", name: "胡桃木满墙书柜", brand: "半木", model: "BK-W02", price: 18000, unit: "套", qty: 1, color: "#5c4a3a", accent: "#4d3d2e", pat: "walnut" },
        { id: "sb3", name: "金属+木组合柜", brand: "HAY", model: "BK-M03", price: 12800, unit: "套", qty: 1, color: "#8a8480", accent: "#c5a86c", pat: "metal-wood" },
      ]},
      { id: "desk", name: "书桌", icon: "⊏", opts: [
        { id: "sd1", name: "白橡木大书桌", brand: "MUJI", model: "DK-O01", price: 5800, unit: "套", qty: 1, color: "#c4aa82", accent: "#b89a72", pat: "wood" },
        { id: "sd2", name: "黑胡桃实木书桌", brand: "半木", model: "DK-W02", price: 12800, unit: "套", qty: 1, color: "#5c4a3a", accent: "#4d3d2e", pat: "walnut" },
        { id: "sd3", name: "升降电动书桌", brand: "乐歌", model: "DK-E03", price: 3600, unit: "套", qty: 1, color: "#e8e4de", accent: "#c0bdb8", pat: "modern" },
      ]},
    ],
    defaults: { floor: "sf1", wall: "sw1", bookshelf: "sb1", desk: "sd1" },
  },
};

const ROOM_ORDER = ["living", "master", "kitchen", "bath", "study"];
const fmt = n => n.toLocaleString("zh-CN");

function getOpt(room, catId, optId) {
  const cat = ROOM_DATA[room]?.cats.find(c => c.id === catId);
  return cat?.opts.find(o => o.id === optId);
}

function calcRoomTotal(room, sel) {
  return Object.entries(sel).reduce((s, [c, o]) => {
    const op = getOpt(room, c, o);
    return s + (op ? op.price * op.qty : 0);
  }, 0);
}

function calcGrandTotal(allSel) {
  return ROOM_ORDER.reduce((s, r) => s + calcRoomTotal(r, allSel[r]), 0);
}

// ── Scene renderers per room ──

function LivingScene({ s }) {
  const f = getOpt("living","floor",s.floor), w = getOpt("living","wall",s.wall);
  const tv = getOpt("living","tvwall",s.tvwall), so = getOpt("living","sofa",s.sofa);
  const li = getOpt("living","light",s.light);
  const T = "all 0.5s ease";
  return (<div style={{ width:"100%",height:"100%",position:"relative",overflow:"hidden",background:`linear-gradient(180deg,#f8f6f3 0%,${w?.color} 25%,${w?.color} 62%,${f?.color} 62%,${f?.color} 100%)`,transition:T }}>
    {/* Ceiling area */}
    <div style={{position:"absolute",top:0,left:0,right:0,height:"20%",background:"#f8f6f3",transition:T}}>
      {li?.pat==="pendant"&&<div style={{position:"absolute",bottom:-55,left:"50%",transform:"translateX(-50)"}}><div style={{width:2,height:35,background:li.color,margin:"0 auto"}}/><div style={{width:44,height:44,borderRadius:"50%",background:`radial-gradient(circle,#fff8,${li.color})`,boxShadow:`0 0 50px 20px ${li.accent}30`,margin:"0 auto"}}/></div>}
      {li?.pat==="linear"&&<div style={{position:"absolute",bottom:-8,left:"22%",right:"22%",height:5,background:li.color,borderRadius:3,boxShadow:`0 0 35px 12px ${li.accent}20`}}/>}
      {(li?.pat==="recessed")&&<div style={{position:"absolute",bottom:0,left:"8%",right:"8%",height:2,background:"linear-gradient(90deg,transparent,#fff8e7,transparent)",boxShadow:"0 0 25px 10px #fff8e740"}}/>}
    </div>
    {/* Left wall */}
    <div style={{position:"absolute",top:"20%",left:0,width:"18%",bottom:"38%",background:w?.color,transition:T,transform:"perspective(800px) rotateY(6deg)",transformOrigin:"right center"}}>
      <div style={{position:"absolute",top:"12%",left:"15%",width:"65%",height:"58%",border:"3px solid rgba(0,0,0,0.06)",borderRadius:2,background:"linear-gradient(135deg,#d8e4ee,#b8cede,#a8bed0)"}}>
        <div style={{position:"absolute",top:0,left:"50%",width:2,height:"100%",background:"rgba(0,0,0,0.06)"}}/>
        <div style={{position:"absolute",top:"50%",left:0,width:"100%",height:2,background:"rgba(0,0,0,0.06)"}}/>
      </div>
    </div>
    {/* Right wall */}
    <div style={{position:"absolute",top:"20%",right:0,width:"16%",bottom:"38%",background:w?.color,transition:T,transform:"perspective(800px) rotateY(-6deg)",transformOrigin:"left center"}}/>
    {/* TV Wall */}
    <div style={{position:"absolute",top:"20%",left:"18%",right:"16%",bottom:"38%",background:tv?.color,transition:T,display:"flex",alignItems:"center",justifyContent:"center"}}>
      {tv?.pat==="slat"&&<div style={{position:"absolute",inset:0,opacity:0.35}}>{Array.from({length:22},(_,i)=><div key={i} style={{position:"absolute",left:`${i*4.5}%`,top:0,width:"2.5%",height:"100%",background:i%2===0?tv.accent:"transparent"}}/>)}</div>}
      {tv?.pat==="marblemetal"&&<><div style={{position:"absolute",left:"3%",top:"4%",bottom:"4%",width:3,background:`linear-gradient(180deg,${tv.accent},${tv.accent}66)`}}/><div style={{position:"absolute",right:"3%",top:"4%",bottom:"4%",width:3,background:`linear-gradient(180deg,${tv.accent},${tv.accent}66)`}}/></>}
      {tv?.pat==="slate"&&<div style={{position:"absolute",inset:0,opacity:0.12}}>{[0,1,2,3,4,5].map(i=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*18}%`,height:1,background:"rgba(0,0,0,0.4)"}}/>)}</div>}
      <div style={{width:"44%",aspectRatio:"16/9",background:"#111",borderRadius:5,border:"3px solid #0a0a0a",boxShadow:"0 6px 40px rgba(0,0,0,0.35),inset 0 0 50px rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2}}>
        <div style={{fontSize:10,color:"#ffffff15",letterSpacing:6}}>远洋 · 质造</div>
      </div>
      <div style={{position:"absolute",bottom:0,left:"14%",right:"14%",height:"15%",background:tv?.pat==="slat"?tv.accent:tv?.pat==="marblemetal"?"#eee8e0":"#3a3530",borderRadius:"4px 4px 0 0"}}/>
    </div>
    {/* Floor */}
    <div style={{position:"absolute",left:0,right:0,bottom:0,height:"38%",background:f?.color,transition:T,transform:"perspective(500px) rotateX(3deg)",transformOrigin:"top center"}}>
      {f?.pat==="tile"&&<div style={{position:"absolute",inset:0,opacity:0.1}}>{[...Array(9)].map((_,i)=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*12.5}%`,height:1,background:"rgba(0,0,0,0.35)"}}/>)}{[...Array(14)].map((_,i)=><div key={`v${i}`} style={{position:"absolute",top:0,bottom:0,left:`${i*7.7}%`,width:1,background:"rgba(0,0,0,0.35)"}}/>)}</div>}
      {f?.pat==="wood"&&<div style={{position:"absolute",inset:0,opacity:0.12}}>{[...Array(18)].map((_,i)=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*5.8}%`,height:1,background:`rgba(0,0,0,${0.15+i%3*0.12})`}}/>)}</div>}
      {f?.pat==="terrazzo"&&<div style={{position:"absolute",inset:0,opacity:0.22}}>{[...Array(30)].map((_,i)=><div key={i} style={{position:"absolute",left:`${(i*41+13)%93}%`,top:`${(i*53+7)%88}%`,width:3+i%5*2,height:3+i%5*2,borderRadius:"40%",background:["#888","#aaa","#777","#bbb","#999","#c5a86c"][i%6]}}/>)}</div>}
      {f?.pat==="marble"&&<svg style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.08}} viewBox="0 0 500 200" preserveAspectRatio="none"><path d="M0,40 Q100,10 200,50 T400,30 T500,60" stroke="#888" strokeWidth="1.2" fill="none"/><path d="M0,100 Q130,75 260,110 T500,90" stroke="#888" strokeWidth="0.9" fill="none"/></svg>}
    </div>
    {/* Sofa */}
    <div style={{position:"absolute",bottom:"22%",left:"50%",transform:"translateX(-50%)",width:"56%",height:"20%",transition:T}}>
      <div style={{position:"absolute",top:0,left:"4%",right:"4%",height:"42%",background:so?.color,borderRadius:"8px 8px 0 0",transition:T}}/>
      <div style={{position:"absolute",top:"38%",left:0,right:0,height:"42%",background:so?.color,borderRadius:7,boxShadow:"0 5px 25px rgba(0,0,0,0.12)",transition:T}}>
        {so?.pat==="woodframe"&&<div style={{position:"absolute",inset:0,borderRadius:7,border:`5px solid ${so.accent}`}}/>}
      </div>
      {so?.pat==="fabric"&&<div style={{position:"absolute",top:"38%",right:"-18%",width:"22%",height:"42%",background:so?.color,borderRadius:"0 7px 7px 0",opacity:0.92,transition:T}}/>}
    </div>
    {/* Coffee table */}
    <div style={{position:"absolute",bottom:"14%",left:"50%",transform:"translateX(-50%)",width:"18%",height:"4.5%",background:"rgba(75,65,55,0.55)",borderRadius:28}}/>
    <div style={{position:"absolute",bottom:"24%",left:"10%"}}><div style={{width:28,height:28,borderRadius:"50%",background:"#6a8a60",margin:"0 auto"}}/><div style={{width:16,height:22,background:"#8a7a6a",margin:"-4px auto 0",borderRadius:"2px 2px 4px 4px"}}/></div>
  </div>);
}

function MasterScene({ s }) {
  const f = getOpt("master","floor",s.floor), w = getOpt("master","wall",s.wall);
  const bh = getOpt("master","bedhead",s.bedhead), bd = getOpt("master","bed",s.bed);
  const li = getOpt("master","light",s.light);
  const T = "all 0.5s ease";
  return (<div style={{width:"100%",height:"100%",position:"relative",overflow:"hidden",background:`linear-gradient(180deg,#f5f2ee 0%,${w?.color} 22%,${w?.color} 60%,${f?.color} 60%,${f?.color} 100%)`,transition:T}}>
    <div style={{position:"absolute",top:0,left:0,right:0,height:"18%",background:"#f5f2ee"}}>
      {li?.pat==="pendant"&&<div style={{position:"absolute",bottom:-45,left:"50%",transform:"translateX(-50%)"}}><div style={{width:1.5,height:28,background:"#bbb",margin:"0 auto"}}/><div style={{width:50,height:50,borderRadius:"50%",background:`radial-gradient(circle,${li.color},${li.accent})`,boxShadow:`0 0 40px 15px ${li.accent}25`,margin:"0 auto",opacity:0.8}}/></div>}
      {li?.pat==="recessed"&&<div style={{position:"absolute",bottom:0,left:"10%",right:"10%",height:2,background:"linear-gradient(90deg,transparent,#fff8e7,transparent)",boxShadow:"0 0 20px 8px #fff8e730"}}/>}
    </div>
    {/* Left wall with window */}
    <div style={{position:"absolute",top:"18%",left:0,width:"20%",bottom:"40%",background:w?.color,transition:T,transform:"perspective(800px) rotateY(5deg)",transformOrigin:"right center"}}>
      <div style={{position:"absolute",top:"15%",left:"18%",width:"60%",height:"55%",background:"linear-gradient(135deg,#dbe8f0,#c5d8e8)",border:"3px solid rgba(0,0,0,0.05)",borderRadius:2}}>
        <div style={{position:"absolute",top:0,left:"50%",width:2,height:"100%",background:"rgba(0,0,0,0.05)"}}/>
      </div>
      <div style={{position:"absolute",top:"8%",right:-2,width:"15%",height:"68%",background:"#d4c5adbb",borderRadius:"0 3px 3px 0"}}/>
    </div>
    {/* Right wall */}
    <div style={{position:"absolute",top:"18%",right:0,width:"15%",bottom:"40%",background:w?.color,transition:T,transform:"perspective(800px) rotateY(-5deg)",transformOrigin:"left center"}}/>
    {/* Bed head wall */}
    <div style={{position:"absolute",top:"18%",left:"20%",right:"15%",bottom:"40%",background:bh?.color||w?.color,transition:T,display:"flex",alignItems:"center",justifyContent:"center"}}>
      {bh?.pat==="leather-pad"&&<div style={{position:"absolute",inset:"5%",borderRadius:4,background:`linear-gradient(135deg,rgba(255,255,255,0.08),transparent,rgba(0,0,0,0.04))`}}/>}
      {bh?.pat==="wood-light"&&<><div style={{position:"absolute",inset:0,opacity:0.15}}>{[...Array(8)].map((_,i)=><div key={i} style={{position:"absolute",left:`${i*12.5}%`,top:0,width:"10%",height:"100%",background:i%2===0?"rgba(0,0,0,0.08)":"transparent"}}/>)}</div><div style={{position:"absolute",bottom:"8%",left:"15%",right:"15%",height:2,background:bh.accent,boxShadow:`0 0 20px 6px ${bh.accent}40`}}/></>}
      {bh?.pat==="art-line"&&<div style={{position:"absolute",inset:"10%",border:"1px solid rgba(0,0,0,0.06)",borderRadius:2}}/>}
      {/* Nightstand lamps */}
      <div style={{position:"absolute",bottom:"15%",left:"8%",width:12,height:24,background:"rgba(0,0,0,0.08)",borderRadius:2}}><div style={{width:8,height:8,borderRadius:"50%",background:"#fff8e7cc",margin:"-4px auto 0",boxShadow:"0 0 12px 4px #fff8e730"}}/></div>
      <div style={{position:"absolute",bottom:"15%",right:"8%",width:12,height:24,background:"rgba(0,0,0,0.08)",borderRadius:2}}><div style={{width:8,height:8,borderRadius:"50%",background:"#fff8e7cc",margin:"-4px auto 0",boxShadow:"0 0 12px 4px #fff8e730"}}/></div>
    </div>
    {/* Floor */}
    <div style={{position:"absolute",left:0,right:0,bottom:0,height:"40%",background:f?.color,transition:T,transform:"perspective(500px) rotateX(3deg)",transformOrigin:"top center"}}>
      {(f?.pat==="wood")&&<div style={{position:"absolute",inset:0,opacity:0.12}}>{[...Array(18)].map((_,i)=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*5.8}%`,height:1,background:`rgba(0,0,0,${0.15+i%3*0.1})`}}/>)}</div>}
      {f?.pat==="herring"&&<div style={{position:"absolute",inset:0,opacity:0.1}}>{[...Array(10)].map((_,i)=><div key={i} style={{position:"absolute",left:`${i*10}%`,top:0,width:"10%",height:"100%",background:i%2===0?`rgba(0,0,0,0.06)`:"transparent",transform:`skewX(${i%2===0?15:-15}deg)`}}/>)}</div>}
    </div>
    {/* Bed */}
    <div style={{position:"absolute",bottom:"24%",left:"50%",transform:"translateX(-50%)",width:"52%",height:"22%",transition:T}}>
      <div style={{position:"absolute",top:"5%",left:"3%",right:"3%",height:"55%",background:bd?.color,borderRadius:"6px 6px 0 0",transition:T}}>
        {bd?.pat==="leather"&&<div style={{position:"absolute",inset:0,borderRadius:"inherit",background:"linear-gradient(135deg,rgba(255,255,255,0.1),transparent,rgba(0,0,0,0.04))"}}/>}
        {bd?.pat==="woodframe"&&<div style={{position:"absolute",inset:0,borderRadius:"inherit",border:`4px solid ${bd.accent}`}}/>}
        {/* Pillows */}
        <div style={{position:"absolute",top:"15%",left:"12%",width:"22%",height:"30%",background:"rgba(255,255,255,0.15)",borderRadius:4}}/>
        <div style={{position:"absolute",top:"15%",right:"12%",width:"22%",height:"30%",background:"rgba(255,255,255,0.15)",borderRadius:4}}/>
        {/* Blanket fold */}
        <div style={{position:"absolute",bottom:0,left:"5%",right:"5%",height:"35%",background:"rgba(255,255,255,0.08)",borderRadius:"0 0 4px 4px"}}/>
      </div>
      <div style={{position:"absolute",bottom:0,left:"8%",width:6,height:"12%",background:bd?.pat==="woodframe"?bd.accent:"#555",borderRadius:2}}/>
      <div style={{position:"absolute",bottom:0,right:"8%",width:6,height:"12%",background:bd?.pat==="woodframe"?bd.accent:"#555",borderRadius:2}}/>
    </div>
  </div>);
}

function KitchenScene({ s }) {
  const f = getOpt("kitchen","floor",s.floor), w = getOpt("kitchen","wall",s.wall);
  const cb = getOpt("kitchen","cabinet",s.cabinet), ct = getOpt("kitchen","counter",s.counter);
  const T = "all 0.5s ease";
  return (<div style={{width:"100%",height:"100%",position:"relative",overflow:"hidden",background:`linear-gradient(180deg,#f5f2ee 0%,${w?.color} 18%,${w?.color} 55%,${f?.color} 55%,${f?.color} 100%)`,transition:T}}>
    <div style={{position:"absolute",top:0,left:0,right:0,height:"15%",background:"#f5f2ee"}}>
      <div style={{position:"absolute",bottom:0,left:"10%",right:"10%",height:2,background:"linear-gradient(90deg,transparent,#fff8e7,transparent)",boxShadow:"0 0 20px 6px #fff8e730"}}/>
    </div>
    {/* Back wall with upper cabinets */}
    <div style={{position:"absolute",top:"15%",left:"8%",right:"8%",bottom:"45%",background:w?.color,transition:T}}>
      {w?.pat==="subway"&&<div style={{position:"absolute",inset:0,opacity:0.1}}>{[...Array(12)].map((_,i)=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*8.5}%`,height:1,background:"rgba(0,0,0,0.3)"}}/>)}{[...Array(8)].map((_,i)=><div key={`v${i}`} style={{position:"absolute",top:0,bottom:0,left:`${12.5*i + (Math.floor(i/1)%2)*6.25}%`,width:1,background:"rgba(0,0,0,0.2)"}}/>)}</div>}
      {/* Upper cabinets */}
      <div style={{position:"absolute",top:"5%",left:"5%",right:"5%",height:"35%",background:cb?.color,borderRadius:3,transition:T,boxShadow:"0 4px 15px rgba(0,0,0,0.06)"}}>
        {cb?.pat==="wood"&&<div style={{position:"absolute",inset:0,borderRadius:3,opacity:0.12}}>{[...Array(6)].map((_,i)=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*18}%`,height:1,background:"rgba(0,0,0,0.3)"}}/>)}</div>}
        <div style={{position:"absolute",top:0,left:"33%",width:1,height:"100%",background:"rgba(0,0,0,0.06)"}}/>
        <div style={{position:"absolute",top:0,left:"66%",width:1,height:"100%",background:"rgba(0,0,0,0.06)"}}/>
        <div style={{position:"absolute",top:"45%",left:"14%",width:16,height:2,borderRadius:1,background:"rgba(0,0,0,0.1)"}}/>
        <div style={{position:"absolute",top:"45%",left:"48%",width:16,height:2,borderRadius:1,background:"rgba(0,0,0,0.1)"}}/>
        <div style={{position:"absolute",top:"45%",right:"14%",width:16,height:2,borderRadius:1,background:"rgba(0,0,0,0.1)"}}/>
      </div>
      {/* Range hood */}
      <div style={{position:"absolute",top:"5%",left:"38%",width:"24%",height:"38%",background:"rgba(180,175,170,0.4)",borderRadius:"0 0 6px 6px",boxShadow:"0 4px 12px rgba(0,0,0,0.04)"}}/>
    </div>
    {/* Counter + lower cabinets */}
    <div style={{position:"absolute",left:"8%",right:"8%",bottom:"45%",height:"12%"}}>
      {/* Counter surface */}
      <div style={{position:"absolute",top:0,left:0,right:0,height:"25%",background:ct?.color,transition:T,borderRadius:"2px 2px 0 0",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
        {ct?.pat==="steel"&&<div style={{position:"absolute",inset:0,background:"linear-gradient(90deg,rgba(255,255,255,0.15),transparent,rgba(255,255,255,0.1))"}}/>}
      </div>
      {/* Lower cabinets */}
      <div style={{position:"absolute",top:"25%",left:0,right:0,bottom:0,background:cb?.color,transition:T,borderRadius:"0 0 3px 3px"}}>
        {cb?.pat==="wood"&&<div style={{position:"absolute",inset:0,opacity:0.1}}>{[...Array(4)].map((_,i)=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*28}%`,height:1,background:"rgba(0,0,0,0.3)"}}/>)}</div>}
        <div style={{position:"absolute",top:0,left:"25%",width:1,height:"100%",background:"rgba(0,0,0,0.05)"}}/>
        <div style={{position:"absolute",top:0,left:"50%",width:1,height:"100%",background:"rgba(0,0,0,0.05)"}}/>
        <div style={{position:"absolute",top:0,left:"75%",width:1,height:"100%",background:"rgba(0,0,0,0.05)"}}/>
      </div>
      {/* Sink */}
      <div style={{position:"absolute",top:"-4%",right:"18%",width:"14%",height:"24%",background:"rgba(0,0,0,0.06)",borderRadius:3}}/>
      {/* Faucet */}
      <div style={{position:"absolute",top:"-20%",right:"22%",width:3,height:"20%",background:"#b0ada8",borderRadius:"3px 3px 0 0"}}><div style={{position:"absolute",top:0,right:-8,width:12,height:3,background:"#b0ada8",borderRadius:2}}/></div>
    </div>
    {/* Floor */}
    <div style={{position:"absolute",left:0,right:0,bottom:0,height:"45%",background:f?.color,transition:T}}>
      {f?.pat==="tile"&&<div style={{position:"absolute",inset:0,opacity:0.08}}>{[...Array(8)].map((_,i)=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*14}%`,height:1,background:"rgba(0,0,0,0.4)"}}/>)}{[...Array(10)].map((_,i)=><div key={`v${i}`} style={{position:"absolute",top:0,bottom:0,left:`${i*11}%`,width:1,background:"rgba(0,0,0,0.4)"}}/>)}</div>}
      {f?.pat==="concrete"&&<div style={{position:"absolute",inset:0,opacity:0.04,background:"repeating-conic-gradient(rgba(0,0,0,0.03) 0% 25%, transparent 0% 50%) 0 0 / 20px 20px"}}/>}
    </div>
  </div>);
}

function BathScene({ s }) {
  const f = getOpt("bath","floor",s.floor), w = getOpt("bath","wall",s.wall);
  const vn = getOpt("bath","vanity",s.vanity), sh = getOpt("bath","shower",s.shower);
  const T = "all 0.5s ease";
  return (<div style={{width:"100%",height:"100%",position:"relative",overflow:"hidden",background:`linear-gradient(180deg,#f0ede8 0%,${w?.color} 15%,${w?.color} 58%,${f?.color} 58%,${f?.color} 100%)`,transition:T}}>
    <div style={{position:"absolute",top:0,left:0,right:0,height:"12%",background:"#f0ede8"}}>
      <div style={{position:"absolute",bottom:0,left:"15%",right:"15%",height:2,background:"linear-gradient(90deg,transparent,#fff8e7,transparent)",boxShadow:"0 0 15px 5px #fff8e725"}}/>
    </div>
    {/* Back wall */}
    <div style={{position:"absolute",top:"12%",left:0,right:0,bottom:"42%",background:w?.color,transition:T}}>
      {w?.pat==="tile"&&<div style={{position:"absolute",inset:0,opacity:0.06}}>{[...Array(8)].map((_,i)=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*13}%`,height:1,background:"rgba(0,0,0,0.4)"}}/>)}{[...Array(10)].map((_,i)=><div key={`v${i}`} style={{position:"absolute",top:0,bottom:0,left:`${i*11}%`,width:1,background:"rgba(0,0,0,0.4)"}}/>)}</div>}
      {w?.pat==="concrete"&&<div style={{position:"absolute",inset:0,opacity:0.04,background:"repeating-conic-gradient(rgba(0,0,0,0.04) 0% 25%, transparent 0% 50%) 0 0 / 30px 30px"}}/>}
      {/* Mirror */}
      <div style={{position:"absolute",top:"8%",left:"28%",width:"20%",height:"65%",background:"linear-gradient(135deg,#e8eef2,#d0dae2,#c5d0d8)",borderRadius:4,border:"2px solid rgba(0,0,0,0.04)",boxShadow:"0 0 20px rgba(255,255,255,0.1)"}}>
        <div style={{position:"absolute",inset:"8%",background:"linear-gradient(135deg,rgba(255,255,255,0.2),transparent)",borderRadius:2}}/>
      </div>
      {/* Shower area (right side) */}
      <div style={{position:"absolute",top:0,right:0,width:"35%",height:"100%",borderLeft:"2px solid rgba(0,0,0,0.04)"}}>
        {/* Glass partition */}
        <div style={{position:"absolute",top:0,left:0,width:2,height:"100%",background:"rgba(200,220,230,0.3)"}}/>
        {/* Shower head */}
        <div style={{position:"absolute",top:"5%",left:"40%"}}>
          <div style={{width:3,height:"40%",background:sh?.color,borderRadius:2}}/>
          <div style={{width:28,height:28,borderRadius:"50%",background:sh?.color,border:`2px solid ${sh?.accent}`,margin:"-2px auto 0",boxShadow:"0 2px 8px rgba(0,0,0,0.1)"}}/>
        </div>
        {/* Shower drops effect */}
        <div style={{position:"absolute",top:"50%",left:"30%",width:"40%",height:"30%",background:"radial-gradient(ellipse,rgba(200,220,235,0.08),transparent)",borderRadius:"50%"}}/>
      </div>
    </div>
    {/* Vanity */}
    <div style={{position:"absolute",bottom:"42%",left:"18%",width:"30%",height:"12%"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:"30%",background:"rgba(200,195,190,0.5)",borderRadius:"2px 2px 0 0"}}/>
      <div style={{position:"absolute",top:"30%",left:0,right:0,bottom:0,background:vn?.color,borderRadius:"0 0 4px 4px",transition:T,boxShadow:"0 4px 12px rgba(0,0,0,0.06)"}}>
        {vn?.pat==="wood"&&<div style={{position:"absolute",inset:0,borderRadius:"inherit",opacity:0.12}}>{[...Array(4)].map((_,i)=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*28}%`,height:1,background:"rgba(0,0,0,0.3)"}}/>)}</div>}
        <div style={{position:"absolute",top:"40%",left:"50%",transform:"translateX(-50%)",width:18,height:3,borderRadius:2,background:"rgba(0,0,0,0.08)"}}/>
      </div>
      {/* Faucet */}
      <div style={{position:"absolute",top:"-15%",left:"45%",width:3,height:"15%",background:sh?.color||"#b0ada8",borderRadius:"3px 3px 0 0"}}/>
    </div>
    {/* Toilet */}
    <div style={{position:"absolute",bottom:"42%",left:"6%",width:"10%",height:"16%"}}>
      <div style={{position:"absolute",top:0,left:"10%",right:"10%",height:"50%",background:"#f0ede8",borderRadius:"4px 4px 0 0",border:"1px solid rgba(0,0,0,0.04)"}}/>
      <div style={{position:"absolute",bottom:0,left:0,right:0,height:"55%",background:"#f5f2ee",borderRadius:"0 0 8px 8px",border:"1px solid rgba(0,0,0,0.04)"}}/>
    </div>
    {/* Floor */}
    <div style={{position:"absolute",left:0,right:0,bottom:0,height:"42%",background:f?.color,transition:T}}>
      {f?.pat==="tile"&&<div style={{position:"absolute",inset:0,opacity:0.08}}>{[...Array(7)].map((_,i)=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*15}%`,height:1,background:"rgba(0,0,0,0.35)"}}/>)}{[...Array(9)].map((_,i)=><div key={`v${i}`} style={{position:"absolute",top:0,bottom:0,left:`${i*12}%`,width:1,background:"rgba(0,0,0,0.35)"}}/>)}</div>}
      {f?.pat==="wood"&&<div style={{position:"absolute",inset:0,opacity:0.1}}>{[...Array(14)].map((_,i)=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*7.5}%`,height:1,background:`rgba(0,0,0,${0.12+i%3*0.08})`}}/>)}</div>}
      {f?.pat==="hex"&&<div style={{position:"absolute",inset:0,opacity:0.08,background:"repeating-conic-gradient(rgba(0,0,0,0.1) 0deg 60deg, transparent 60deg 120deg) 0 0 / 24px 24px"}}/>}
    </div>
  </div>);
}

function StudyScene({ s }) {
  const f = getOpt("study","floor",s.floor), w = getOpt("study","wall",s.wall);
  const bs = getOpt("study","bookshelf",s.bookshelf), dk = getOpt("study","desk",s.desk);
  const T = "all 0.5s ease";
  return (<div style={{width:"100%",height:"100%",position:"relative",overflow:"hidden",background:`linear-gradient(180deg,#f2efea 0%,${w?.color} 20%,${w?.color} 60%,${f?.color} 60%,${f?.color} 100%)`,transition:T}}>
    <div style={{position:"absolute",top:0,left:0,right:0,height:"16%",background:"#f2efea"}}>
      <div style={{position:"absolute",bottom:0,left:"12%",right:"12%",height:2,background:"linear-gradient(90deg,transparent,#fff8e7,transparent)",boxShadow:"0 0 18px 6px #fff8e725"}}/>
    </div>
    {/* Left wall with window */}
    <div style={{position:"absolute",top:"16%",left:0,width:"22%",bottom:"40%",background:w?.color,transition:T,transform:"perspective(800px) rotateY(5deg)",transformOrigin:"right center"}}>
      <div style={{position:"absolute",top:"10%",left:"12%",width:"70%",height:"60%",background:"linear-gradient(135deg,#d8e4ee,#c5d8e8)",border:"3px solid rgba(0,0,0,0.05)",borderRadius:2}}>
        <div style={{position:"absolute",top:"50%",left:0,width:"100%",height:2,background:"rgba(0,0,0,0.05)"}}/>
      </div>
    </div>
    {/* Right wall */}
    <div style={{position:"absolute",top:"16%",right:0,width:"12%",bottom:"40%",background:w?.color,transition:T,transform:"perspective(800px) rotateY(-5deg)",transformOrigin:"left center"}}/>
    {/* Back wall with bookshelf */}
    <div style={{position:"absolute",top:"16%",left:"22%",right:"12%",bottom:"40%",background:w?.color,transition:T}}>
      {w?.pat==="woodpanel"&&<div style={{position:"absolute",inset:0,opacity:0.12}}>{[...Array(8)].map((_,i)=><div key={i} style={{position:"absolute",left:`${i*12.5}%`,top:0,width:"10%",height:"100%",background:i%2===0?"rgba(0,0,0,0.06)":"transparent"}}/>)}</div>}
      {/* Bookshelf */}
      <div style={{position:"absolute",top:"5%",left:"5%",width:"40%",height:"88%",background:bs?.color,borderRadius:4,transition:T,boxShadow:"0 4px 20px rgba(0,0,0,0.06)"}}>
        {bs?.pat==="walnut"&&<div style={{position:"absolute",inset:0,borderRadius:4,opacity:0.1}}>{[...Array(6)].map((_,i)=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*18}%`,height:1,background:"rgba(0,0,0,0.4)"}}/>)}</div>}
        {bs?.pat==="metal-wood"&&<><div style={{position:"absolute",left:0,top:0,width:3,height:"100%",background:bs.accent}}/><div style={{position:"absolute",right:0,top:0,width:3,height:"100%",background:bs.accent}}/></>}
        {/* Shelves */}
        {[0,1,2,3].map(i=><div key={i} style={{position:"absolute",left:"4%",right:"4%",top:`${20+i*20}%`,height:2,background:"rgba(0,0,0,0.08)"}}/>)}
        {/* Books */}
        {[0,1,2,3].map(row=><div key={row} style={{position:"absolute",left:"8%",right:"8%",top:`${5+row*20}%`,height:"14%",display:"flex",gap:2,alignItems:"flex-end"}}>{
          Array.from({length:5+row%3},(_,i)=><div key={i} style={{width:`${12+i%3*4}%`,height:`${60+i%4*10}%`,background:["#8b4513","#2f4f4f","#8b0000","#2e4a62","#6b4423","#4a6741","#5c3a21","#3d5a80"][i%8],borderRadius:"1px 1px 0 0",opacity:0.35}}/>)
        }</div>)}
      </div>
    </div>
    {/* Floor */}
    <div style={{position:"absolute",left:0,right:0,bottom:0,height:"40%",background:f?.color,transition:T}}>
      {f?.pat==="wood"&&<div style={{position:"absolute",inset:0,opacity:0.12}}>{[...Array(16)].map((_,i)=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*6.5}%`,height:1,background:`rgba(0,0,0,${0.12+i%3*0.08})`}}/>)}</div>}
      {f?.pat==="tile"&&<div style={{position:"absolute",inset:0,opacity:0.08}}>{[...Array(8)].map((_,i)=><div key={i} style={{position:"absolute",left:0,right:0,top:`${i*13}%`,height:1,background:"rgba(0,0,0,0.35)"}}/>)}{[...Array(12)].map((_,i)=><div key={`v${i}`} style={{position:"absolute",top:0,bottom:0,left:`${i*9}%`,width:1,background:"rgba(0,0,0,0.35)"}}/>)}</div>}
      {f?.pat==="herring"&&<div style={{position:"absolute",inset:0,opacity:0.1}}>{[...Array(12)].map((_,i)=><div key={i} style={{position:"absolute",left:`${i*8.5}%`,top:0,width:"8%",height:"100%",background:i%2===0?"rgba(0,0,0,0.05)":"transparent",transform:`skewX(${i%2===0?15:-15}deg)`}}/>)}</div>}
    </div>
    {/* Desk */}
    <div style={{position:"absolute",bottom:"28%",left:"50%",transform:"translateX(-50%)",width:"38%",height:"10%"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:"30%",background:dk?.color,borderRadius:3,transition:T,boxShadow:"0 2px 10px rgba(0,0,0,0.06)"}}>
        {dk?.pat==="modern"&&<div style={{position:"absolute",inset:0,background:"linear-gradient(90deg,rgba(255,255,255,0.08),transparent)",borderRadius:3}}/>}
      </div>
      <div style={{position:"absolute",bottom:0,left:"8%",width:5,height:"75%",background:dk?.pat==="modern"?dk.accent:dk?.color,borderRadius:2,transition:T}}/>
      <div style={{position:"absolute",bottom:0,right:"8%",width:5,height:"75%",background:dk?.pat==="modern"?dk.accent:dk?.color,borderRadius:2,transition:T}}/>
      {/* Monitor */}
      <div style={{position:"absolute",top:"-55%",left:"30%",width:"40%",aspectRatio:"16/10",background:"#1a1a1a",borderRadius:3,border:"2px solid #111"}}>
        <div style={{position:"absolute",inset:"5%",background:"linear-gradient(135deg,#0a0a12,#12121e)",borderRadius:2}}/>
      </div>
      <div style={{position:"absolute",top:"-5%",left:"47%",width:"6%",height:"8%",background:"#333"}}/>
      {/* Lamp */}
      <div style={{position:"absolute",top:"-30%",right:"5%"}}><div style={{width:3,height:20,background:"#555",margin:"0 auto"}}/><div style={{width:20,height:10,background:"rgba(255,248,230,0.6)",borderRadius:"10px 10px 0 0",boxShadow:"0 0 12px 4px rgba(255,248,230,0.15)"}}/></div>
    </div>
    {/* Chair */}
    <div style={{position:"absolute",bottom:"18%",left:"50%",transform:"translateX(-50%)",width:"12%",height:"12%"}}>
      <div style={{position:"absolute",top:0,left:"15%",right:"15%",height:"55%",background:"#555",borderRadius:"6px 6px 0 0"}}/>
      <div style={{position:"absolute",top:"50%",left:"10%",right:"10%",height:"30%",background:"#444",borderRadius:3}}/>
      <div style={{position:"absolute",bottom:0,left:"35%",width:"30%",height:"20%",background:"#3a3a3a",borderRadius:"0 0 3px 3px"}}/>
    </div>
  </div>);
}

const SCENES = { living: LivingScene, master: MasterScene, kitchen: KitchenScene, bath: BathScene, study: StudyScene };

// ── Order Modal ──
function OrderModal({ allSel, onClose }) {
  const grand = calcGrandTotal(allSel);
  return (
    <div onClick={e=>{if(e.target===e.currentTarget)onClose()}} style={{position:"fixed",inset:0,zIndex:100,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(12px)",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:"92%",maxWidth:520,maxHeight:"85vh",background:"#141a18",borderRadius:18,border:"1px solid rgba(45,212,168,0.12)",overflow:"hidden",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"18px 22px 14px",borderBottom:"1px solid rgba(255,255,255,0.05)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:17,fontWeight:700,color:"#fff"}}>全屋选配清单</div><div style={{fontSize:11,color:"rgba(255,255,255,0.35)",marginTop:3}}>贵阳远洋天铂 · A2户型 · 138㎡</div></div>
          <button onClick={onClose} style={{width:30,height:30,borderRadius:"50%",background:"rgba(255,255,255,0.05)",border:"none",color:"rgba(255,255,255,0.4)",fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"4px 22px"}}>
          {ROOM_ORDER.map(roomId => {
            const room = ROOM_DATA[roomId];
            const items = Object.entries(allSel[roomId]).map(([c,o])=>{const cat=room.cats.find(x=>x.id===c);const opt=cat?.opts.find(x=>x.id===o);return opt?{catName:cat.name,...opt}:null}).filter(Boolean);
            const roomTotal = calcRoomTotal(roomId, allSel[roomId]);
            return (<div key={roomId} style={{marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0 6px",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                <span style={{fontSize:13,fontWeight:600,color:"#2dd4a8"}}>{room.name}</span>
                <span style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,0.6)",fontVariantNumeric:"tabular-nums"}}>¥{fmt(roomTotal)}</span>
              </div>
              {items.map((item,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:i<items.length-1?"1px solid rgba(255,255,255,0.02)":"none"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:26,height:26,borderRadius:5,background:item.color,border:"1px solid rgba(255,255,255,0.04)",flexShrink:0}}/>
                  <div><div style={{fontSize:11.5,color:"rgba(255,255,255,0.75)"}}><span style={{color:"rgba(255,255,255,0.25)",fontSize:10,marginRight:4}}>{item.catName}</span>{item.name}</div><div style={{fontSize:9.5,color:"rgba(255,255,255,0.25)",marginTop:1}}>{item.brand} · ×{item.qty}{item.unit}</div></div>
                </div>
                <div style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,0.8)",fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}}>¥{fmt(item.price*item.qty)}</div>
              </div>))}
            </div>);
          })}
        </div>
        <div style={{padding:"14px 22px 18px",borderTop:"1px solid rgba(255,255,255,0.05)",background:"rgba(45,212,168,0.02)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:12}}>
            <span style={{fontSize:13,color:"rgba(255,255,255,0.45)"}}>全屋选配总价</span>
            <span style={{fontSize:26,fontWeight:800,color:"#2dd4a8",fontVariantNumeric:"tabular-nums"}}>¥{fmt(grand)}</span>
          </div>
          <button style={{width:"100%",padding:"13px 0",borderRadius:11,background:"linear-gradient(135deg,#2dd4a8,#1ab894)",border:"none",color:"#0a0f0d",fontSize:14.5,fontWeight:700,cursor:"pointer",letterSpacing:2}}>确认方案 · 生成施工工单</button>
          <p style={{textAlign:"center",marginTop:7,marginBottom:0,fontSize:10.5,color:"rgba(255,255,255,0.2)"}}>确认后将自动生成材料采购单、施工工序及验收标准</p>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──
export default function App() {
  const [activeRoom, setActiveRoom] = useState("living");
  const [allSel, setAllSel] = useState(
    Object.fromEntries(ROOM_ORDER.map(r => [r, { ...ROOM_DATA[r].defaults }]))
  );
  const [activeCat, setActiveCat] = useState(null);
  const [showOrder, setShowOrder] = useState(false);
  const [showPanel, setShowPanel] = useState(true);

  const room = ROOM_DATA[activeRoom];
  const sel = allSel[activeRoom];
  const firstCat = room.cats[0]?.id;
  const currentCat = activeCat && room.cats.find(c => c.id === activeCat) ? activeCat : firstCat;
  const catData = room.cats.find(c => c.id === currentCat);
  const grand = calcGrandTotal(allSel);

  const SceneComp = SCENES[activeRoom];

  return (
    <div style={{width:"100%",height:"100vh",display:"flex",flexDirection:"column",background:"#0a0f0d",overflow:"hidden",position:"relative",fontFamily:"'Noto Sans SC',-apple-system,sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0}::-webkit-scrollbar{height:3px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:3px}`}</style>

      {/* Top bar */}
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
          <button onClick={()=>setShowOrder(true)} style={{padding:"5px 12px",borderRadius:7,background:"rgba(45,212,168,0.12)",border:"1px solid rgba(45,212,168,0.25)",color:"#2dd4a8",fontSize:11,fontWeight:600,cursor:"pointer"}}>清单 ¥{fmt(grand)}</button>
        </div>
      </div>

      {/* Scene */}
      <div style={{flex:1,position:"relative"}}>
        <SceneComp s={sel} />
        <div style={{position:"absolute",top:14,left:"50%",transform:"translateX(-50%)",background:"rgba(0,0,0,0.45)",backdropFilter:"blur(10px)",padding:"5px 18px",borderRadius:18,color:"white",fontSize:12,fontWeight:500,letterSpacing:4}}>{room.label}</div>
      </div>

      {/* Room nav */}
      <div style={{position:"absolute",bottom:showPanel?200:14,left:"50%",transform:"translateX(-50%)",zIndex:10,display:"flex",gap:4,padding:5,background:"rgba(0,0,0,0.45)",backdropFilter:"blur(10px)",borderRadius:10,transition:"bottom 0.3s ease"}}>
        {ROOM_ORDER.map(r=><button key={r} onClick={()=>{setActiveRoom(r);setActiveCat(null)}} style={{padding:"5px 14px",borderRadius:7,background:activeRoom===r?"rgba(45,212,168,0.18)":"transparent",border:activeRoom===r?"1px solid rgba(45,212,168,0.35)":"1px solid transparent",color:activeRoom===r?"#2dd4a8":"rgba(255,255,255,0.35)",fontSize:11,fontWeight:activeRoom===r?600:400,cursor:"pointer",opacity:activeRoom===r?1:0.55}}>{ROOM_DATA[r].name}</button>)}
      </div>

      {/* Selection panel */}
      {showPanel&&(
        <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(180deg,rgba(10,15,13,0.8),rgba(10,15,13,0.97) 35%)",backdropFilter:"blur(18px)",padding:"10px 14px 14px",borderTop:"1px solid rgba(255,255,255,0.05)",zIndex:5}}>
          <div style={{display:"flex",gap:4,paddingBottom:8,overflowX:"auto"}}>
            {room.cats.map(c=>(
              <button key={c.id} onClick={()=>setActiveCat(c.id)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"6px 13px",borderRadius:9,border:currentCat===c.id?"1.5px solid #2dd4a8":"1.5px solid rgba(255,255,255,0.06)",background:currentCat===c.id?"rgba(45,212,168,0.08)":"rgba(255,255,255,0.02)",color:currentCat===c.id?"#2dd4a8":"rgba(255,255,255,0.5)",cursor:"pointer",whiteSpace:"nowrap",fontSize:11}}>
                <span style={{fontSize:16}}>{c.icon}</span><span style={{fontWeight:500}}>{c.name}</span>
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:7,overflowX:"auto",paddingBottom:4}}>
            {catData?.opts.map(opt=>{
              const on = sel[currentCat]===opt.id;
              return (
                <button key={opt.id} onClick={()=>setAllSel(prev=>({...prev,[activeRoom]:{...prev[activeRoom],[currentCat]:opt.id}}))} style={{flex:"0 0 auto",width:122,padding:9,borderRadius:11,border:on?"2px solid #2dd4a8":"2px solid rgba(255,255,255,0.05)",background:on?"rgba(45,212,168,0.06)":"rgba(255,255,255,0.015)",cursor:"pointer",textAlign:"left",position:"relative",overflow:"hidden"}}>
                  <div style={{width:"100%",height:36,borderRadius:5,marginBottom:7,background:opt.color,border:"1px solid rgba(0,0,0,0.06)",position:"relative",overflow:"hidden"}}>
                    {opt.pat==="wood"&&<div style={{position:"absolute",inset:0,opacity:0.18,background:`repeating-linear-gradient(0deg,transparent,transparent 3px,${opt.accent} 3px,${opt.accent} 4px)`}}/>}
                    {opt.pat==="marble"&&<svg style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.18}} viewBox="0 0 122 36"><path d="M0,12 Q30,4 60,16 T122,12" stroke={opt.accent} strokeWidth="1" fill="none"/></svg>}
                    {opt.pat==="terrazzo"&&<div style={{position:"absolute",inset:0}}>{[...Array(7)].map((_,i)=><div key={i} style={{position:"absolute",left:`${(i*31+8)%82}%`,top:`${(i*41+12)%65}%`,width:3+i%3*1.5,height:3+i%3*1.5,borderRadius:"40%",background:"#888",opacity:0.28}}/>)}</div>}
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
      {showOrder&&<OrderModal allSel={allSel} onClose={()=>setShowOrder(false)}/>}
    </div>
  );
}
