import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════
// 河狸云 · 远洋元阳 — 全景选配系统
// Three.js 等距柱状投影全景 + 个性化精装选配
// ═══════════════════════════════════════════════════════════════

// --- Room & panorama definitions ---

interface RoomOption {
  id: string;
  name: string;
  brand: string;
  model: string;
  price: number;
  unit: string;
  qty: number;
  color: string;
  accent: string;
  pat: string;
}

interface RoomCategory {
  id: string;
  name: string;
  icon: string;
  options: RoomOption[];
}

interface RoomDef {
  name: string;
  label: string;
  pano: string;
  categories: RoomCategory[];
  defaults: Record<string, string>;
}

const ROOM_DATA: Record<string, RoomDef> = {
  living: {
    name: '客厅', label: '客 厅',
    pano: '/yuanyang/living.jpg',
    categories: [
      {
        id: 'floor', name: '地面', icon: '◫', options: [
          { id: 'lf1', name: '爵士白大理石', brand: '诺贝尔', model: 'W63012', price: 428, unit: '㎡', qty: 35, color: '#e8e4df', accent: '#d4cfc8', pat: 'marble' },
          { id: 'lf2', name: '北美白橡木地板', brand: '大自然', model: 'DSQ001', price: 368, unit: '㎡', qty: 35, color: '#c4a97d', accent: '#b89968', pat: 'wood' },
          { id: 'lf3', name: '莫兰迪灰瓷砖', brand: '马可波罗', model: 'FG8025', price: 298, unit: '㎡', qty: 35, color: '#a8a09a', accent: '#9b938d', pat: 'tile' },
          { id: 'lf4', name: '水磨石', brand: '蒙娜丽莎', model: 'TS6601', price: 358, unit: '㎡', qty: 35, color: '#d6d0c8', accent: '#bfb8ae', pat: 'terrazzo' },
        ]
      },
      {
        id: 'wall', name: '墙面', icon: '▦', options: [
          { id: 'lw1', name: '云白乳胶漆', brand: '多乐士', model: 'A991', price: 65, unit: '㎡', qty: 82, color: '#f5f2ee', accent: '#f5f2ee', pat: 'solid' },
          { id: 'lw2', name: '暖灰微水泥', brand: '磐多魔', model: 'MC-G03', price: 320, unit: '㎡', qty: 82, color: '#c8c0b8', accent: '#bdb5ac', pat: 'concrete' },
          { id: 'lw3', name: '白栎木饰面', brand: '科定', model: 'KD-S12', price: 480, unit: '㎡', qty: 82, color: '#d4c5a9', accent: '#c9ba9a', pat: 'woodpanel' },
          { id: 'lw4', name: '鼠尾草绿', brand: '本杰明摩尔', model: 'HC-114', price: 88, unit: '㎡', qty: 82, color: '#b5bfa8', accent: '#a8b29b', pat: 'solid' },
        ]
      },
      {
        id: 'tvwall', name: '背景墙', icon: '▣', options: [
          { id: 'lt1', name: '岩板一体背景', brand: '德利丰', model: 'YB-8201', price: 12800, unit: '套', qty: 1, color: '#6b6560', accent: '#5c5650', pat: 'slate' },
          { id: 'lt2', name: '黑胡桃木格栅', brand: '科定', model: 'KD-TV06', price: 8600, unit: '套', qty: 1, color: '#5c4a3a', accent: '#4d3d2e', pat: 'slat' },
          { id: 'lt3', name: '大理石+金属', brand: '诺贝尔', model: 'TV-M01', price: 15800, unit: '套', qty: 1, color: '#ddd8d0', accent: '#c5a86c', pat: 'marblemetal' },
        ]
      },
      {
        id: 'sofa', name: '沙发', icon: '⊏', options: [
          { id: 'ls1', name: '烟灰L型布艺', brand: 'HAY', model: 'MAGS-L', price: 28600, unit: '套', qty: 1, color: '#8a8580', accent: '#7d7873', pat: 'fabric' },
          { id: 'ls2', name: '奶油白意式真皮', brand: 'Natuzzi', model: 'IAGO', price: 42000, unit: '套', qty: 1, color: '#ede5d8', accent: '#e0d8ca', pat: 'leather' },
          { id: 'ls3', name: '复古绿丝绒', brand: 'Cassina', model: 'MARA', price: 56000, unit: '套', qty: 1, color: '#5a7a62', accent: '#4d6b54', pat: 'velvet' },
        ]
      },
      {
        id: 'light', name: '主灯', icon: '◉', options: [
          { id: 'll1', name: '无主灯设计', brand: '三雄极光', model: 'NL-S01', price: 6800, unit: '套', qty: 1, color: '#fff8e7', accent: '#fff3d4', pat: 'recessed' },
          { id: 'll2', name: '黄铜球形吊灯', brand: 'FLOS', model: 'IC-S2', price: 12800, unit: '套', qty: 1, color: '#c5a86c', accent: '#b89755', pat: 'pendant' },
          { id: 'll3', name: '极简线性灯', brand: 'VIBIA', model: 'HALO', price: 8900, unit: '套', qty: 1, color: '#f0ede8', accent: '#fff8e7', pat: 'linear' },
        ]
      },
    ],
    defaults: { floor: 'lf1', wall: 'lw1', tvwall: 'lt1', sofa: 'ls1', light: 'll1' },
  },
  bedroom1f: {
    name: '一楼卧室', label: '一楼卧室',
    pano: '/yuanyang/bedroom1f.jpg',
    categories: [
      {
        id: 'floor', name: '地面', icon: '◫', options: [
          { id: 'b1f1', name: '胡桃木地板', brand: '大自然', model: 'HT-W01', price: 458, unit: '㎡', qty: 18, color: '#8b7355', accent: '#7a6348', pat: 'wood' },
          { id: 'b1f2', name: '奶油色橡木地板', brand: '圣象', model: 'NK1008', price: 388, unit: '㎡', qty: 18, color: '#d4c5a9', accent: '#c4b595', pat: 'wood' },
          { id: 'b1f3', name: '浅灰瓷砖', brand: '东鹏', model: 'LN60', price: 268, unit: '㎡', qty: 18, color: '#c8c3bd', accent: '#b8b3ac', pat: 'tile' },
        ]
      },
      {
        id: 'wall', name: '墙面', icon: '▦', options: [
          { id: 'b1w1', name: '暖白乳胶漆', brand: '多乐士', model: 'N991', price: 65, unit: '㎡', qty: 48, color: '#f8f4ef', accent: '#f8f4ef', pat: 'solid' },
          { id: 'b1w2', name: '莫兰迪粉', brand: '本杰明摩尔', model: 'HC-63', price: 88, unit: '㎡', qty: 48, color: '#e0cfc5', accent: '#d4c3b8', pat: 'solid' },
          { id: 'b1w3', name: '薄荷灰绿', brand: '芬琳', model: 'F487', price: 92, unit: '㎡', qty: 48, color: '#c5cfc5', accent: '#b8c2b8', pat: 'solid' },
        ]
      },
      {
        id: 'bedwall', name: '床头背景', icon: '▣', options: [
          { id: 'b1bw1', name: '皮革软包', brand: 'CBD', model: 'BP-01', price: 6800, unit: '套', qty: 1, color: '#a08870', accent: '#8a7560', pat: 'leather' },
          { id: 'b1bw2', name: '木饰面+灯带', brand: '科定', model: 'KD-B05', price: 8200, unit: '套', qty: 1, color: '#8b7355', accent: '#fff8e7', pat: 'woodlight' },
          { id: 'b1bw3', name: '艺术涂料', brand: '瓦帕', model: 'AT-12', price: 5600, unit: '套', qty: 1, color: '#b8a898', accent: '#a89888', pat: 'artpaint' },
        ]
      },
      {
        id: 'bed', name: '床', icon: '▭', options: [
          { id: 'b1bd1', name: '布艺软床 1.5m', brand: 'CBD', model: 'D028', price: 9800, unit: '套', qty: 1, color: '#c8bfb5', accent: '#b8afa5', pat: 'fabric' },
          { id: 'b1bd2', name: '真皮软床 1.5m', brand: '慕思', model: 'V6-T226', price: 15600, unit: '套', qty: 1, color: '#8a7a6a', accent: '#7a6a5a', pat: 'leather' },
          { id: 'b1bd3', name: '实木框架床 1.5m', brand: '源氏木语', model: 'Y8602', price: 6800, unit: '套', qty: 1, color: '#a08060', accent: '#c4a97d', pat: 'woodframe' },
        ]
      },
      {
        id: 'wardrobe', name: '衣柜', icon: '⊞', options: [
          { id: 'b1wr1', name: '白色极简平开门', brand: '索菲亚', model: 'WR-W01', price: 12800, unit: '套', qty: 1, color: '#f0ece6', accent: '#e8e4de', pat: 'white' },
          { id: 'b1wr2', name: '木纹推拉门', brand: '欧派', model: 'WR-M02', price: 10200, unit: '套', qty: 1, color: '#a08060', accent: '#8b7050', pat: 'woodslide' },
          { id: 'b1wr3', name: '玻璃+金属框', brand: '好莱客', model: 'WR-G03', price: 15800, unit: '套', qty: 1, color: '#d8d4d0', accent: '#888', pat: 'glass' },
        ]
      },
    ],
    defaults: { floor: 'b1f1', wall: 'b1w1', bedwall: 'b1bw1', bed: 'b1bd1', wardrobe: 'b1wr1' },
  },
  bath1f: {
    name: '一楼次卫', label: '一楼次卫',
    pano: '/yuanyang/bath1f.jpg',
    categories: [
      {
        id: 'floor', name: '地砖', icon: '◫', options: [
          { id: 'bt1f1', name: '防滑深灰砖', brand: '诺贝尔', model: 'BF-D01', price: 248, unit: '㎡', qty: 5, color: '#7a7570', accent: '#6a6560', pat: 'tile' },
          { id: 'bt1f2', name: '木纹防滑砖', brand: '马可波罗', model: 'BF-W02', price: 288, unit: '㎡', qty: 5, color: '#a89880', accent: '#988870', pat: 'wood' },
          { id: 'bt1f3', name: '水磨石砖', brand: '蒙娜丽莎', model: 'BF-T03', price: 328, unit: '㎡', qty: 5, color: '#c8c2ba', accent: '#b8b2aa', pat: 'terrazzo' },
        ]
      },
      {
        id: 'wall', name: '墙砖', icon: '▦', options: [
          { id: 'bt1w1', name: '白色亮面砖', brand: '东鹏', model: 'BW-W01', price: 168, unit: '㎡', qty: 18, color: '#f0ece8', accent: '#e8e4e0', pat: 'glossy' },
          { id: 'bt1w2', name: '浅灰哑光砖', brand: '诺贝尔', model: 'BW-G02', price: 198, unit: '㎡', qty: 18, color: '#c8c4c0', accent: '#bab6b2', pat: 'matte' },
          { id: 'bt1w3', name: '奶油色微水泥', brand: '磐多魔', model: 'BW-C03', price: 380, unit: '㎡', qty: 18, color: '#ddd5ca', accent: '#cec6ba', pat: 'concrete' },
        ]
      },
      {
        id: 'vanity', name: '浴室柜', icon: '▤', options: [
          { id: 'bt1v1', name: '白色悬挂式 80cm', brand: 'TOTO', model: 'LDSW601', price: 8800, unit: '套', qty: 1, color: '#f0ece6', accent: '#e5e0da', pat: 'white' },
          { id: 'bt1v2', name: '木纹落地式 100cm', brand: '箭牌', model: 'AE2507', price: 6200, unit: '套', qty: 1, color: '#a08060', accent: '#8b7050', pat: 'wood' },
          { id: 'bt1v3', name: '岩板一体盆 90cm', brand: '恒洁', model: 'HBM-801', price: 12800, unit: '套', qty: 1, color: '#8a8580', accent: '#7a7570', pat: 'sintered' },
        ]
      },
      {
        id: 'toilet', name: '马桶', icon: '◯', options: [
          { id: 'bt1t1', name: '智能马桶一体机', brand: 'TOTO', model: 'CES99', price: 16800, unit: '台', qty: 1, color: '#f5f2ef', accent: '#eae7e2', pat: 'smart' },
          { id: 'bt1t2', name: '壁挂式马桶', brand: '杜拉维特', model: 'ME-252009', price: 12600, unit: '台', qty: 1, color: '#f0ede8', accent: '#e5e2dc', pat: 'wallhung' },
          { id: 'bt1t3', name: '普通连体马桶', brand: '科勒', model: 'K-5171T', price: 4800, unit: '台', qty: 1, color: '#f2efea', accent: '#e8e5e0', pat: 'standard' },
        ]
      },
      {
        id: 'shower', name: '淋浴', icon: '⊕', options: [
          { id: 'bt1s1', name: '恒温花洒套装', brand: '汉斯格雅', model: 'RD-S240', price: 8800, unit: '套', qty: 1, color: '#c0c0c5', accent: '#aaaaaf', pat: 'chrome' },
          { id: 'bt1s2', name: '黑色暗装花洒', brand: '科勒', model: 'K-77982T', price: 12800, unit: '套', qty: 1, color: '#3a3a3a', accent: '#2a2a2a', pat: 'black' },
          { id: 'bt1s3', name: '钢琴键花洒系统', brand: '摩恩', model: 'PK-600', price: 6800, unit: '套', qty: 1, color: '#e0e0e2', accent: '#d0d0d2', pat: 'piano' },
        ]
      },
    ],
    defaults: { floor: 'bt1f1', wall: 'bt1w1', vanity: 'bt1v1', toilet: 'bt1t1', shower: 'bt1s1' },
  },
  master2f: {
    name: '二楼主卧', label: '二楼主卧',
    pano: '/yuanyang/master2f.jpg',
    categories: [
      {
        id: 'floor', name: '地面', icon: '◫', options: [
          { id: 'm2f1', name: '胡桃木地板', brand: '大自然', model: 'HT-W01', price: 458, unit: '㎡', qty: 25, color: '#8b7355', accent: '#7a6348', pat: 'wood' },
          { id: 'm2f2', name: '奶油色橡木地板', brand: '圣象', model: 'NK1008', price: 388, unit: '㎡', qty: 25, color: '#d4c5a9', accent: '#c4b595', pat: 'wood' },
          { id: 'm2f3', name: '人字拼地板', brand: '圣象', model: 'SF-H03', price: 488, unit: '㎡', qty: 25, color: '#b89968', accent: '#a88858', pat: 'herringbone' },
        ]
      },
      {
        id: 'wall', name: '墙面', icon: '▦', options: [
          { id: 'm2w1', name: '暖白乳胶漆', brand: '多乐士', model: 'N991', price: 65, unit: '㎡', qty: 65, color: '#f8f4ef', accent: '#f8f4ef', pat: 'solid' },
          { id: 'm2w2', name: '莫兰迪粉', brand: '本杰明摩尔', model: 'HC-63', price: 88, unit: '㎡', qty: 65, color: '#e0cfc5', accent: '#d4c3b8', pat: 'solid' },
          { id: 'm2w3', name: '浅咖织物墙布', brand: '玉兰', model: 'WB-208', price: 180, unit: '㎡', qty: 65, color: '#c8b8a5', accent: '#baa892', pat: 'fabric' },
        ]
      },
      {
        id: 'bedwall', name: '床头背景', icon: '▣', options: [
          { id: 'm2bw1', name: '皮革软包', brand: 'CBD', model: 'BP-01', price: 8800, unit: '套', qty: 1, color: '#a08870', accent: '#8a7560', pat: 'leather' },
          { id: 'm2bw2', name: '木饰面+灯带', brand: '科定', model: 'KD-B05', price: 10200, unit: '套', qty: 1, color: '#8b7355', accent: '#fff8e7', pat: 'woodlight' },
          { id: 'm2bw3', name: '极简乳胶漆', brand: '多乐士', model: 'S991', price: 3200, unit: '套', qty: 1, color: '#e8e2dc', accent: '#ddd7d0', pat: 'minimal' },
        ]
      },
      {
        id: 'bed', name: '床', icon: '▭', options: [
          { id: 'm2bd1', name: '布艺软床 1.8m', brand: 'CBD', model: 'D028', price: 12800, unit: '套', qty: 1, color: '#c8bfb5', accent: '#b8afa5', pat: 'fabric' },
          { id: 'm2bd2', name: '真皮软床 1.8m', brand: '慕思', model: 'V6-T226', price: 18600, unit: '套', qty: 1, color: '#8a7a6a', accent: '#7a6a5a', pat: 'leather' },
          { id: 'm2bd3', name: '实木框架床 1.8m', brand: '源氏木语', model: 'Y8602', price: 8800, unit: '套', qty: 1, color: '#a08060', accent: '#c4a97d', pat: 'woodframe' },
        ]
      },
      {
        id: 'wardrobe', name: '衣柜', icon: '⊞', options: [
          { id: 'm2wr1', name: '白色极简平开门', brand: '索菲亚', model: 'WR-W01', price: 18800, unit: '套', qty: 1, color: '#f0ece6', accent: '#e8e4de', pat: 'white' },
          { id: 'm2wr2', name: '木纹推拉门', brand: '欧派', model: 'WR-M02', price: 15200, unit: '套', qty: 1, color: '#a08060', accent: '#8b7050', pat: 'woodslide' },
          { id: 'm2wr3', name: '玻璃+金属框', brand: '好莱客', model: 'WR-G03', price: 22800, unit: '套', qty: 1, color: '#d8d4d0', accent: '#888', pat: 'glass' },
        ]
      },
    ],
    defaults: { floor: 'm2f1', wall: 'm2w1', bedwall: 'm2bw1', bed: 'm2bd1', wardrobe: 'm2wr1' },
  },
  bath2f: {
    name: '二楼主卫', label: '二楼主卫',
    pano: '/yuanyang/bath2f.jpg',
    categories: [
      {
        id: 'floor', name: '地砖', icon: '◫', options: [
          { id: 'bt2f1', name: '防滑深灰砖', brand: '诺贝尔', model: 'BF-D01', price: 248, unit: '㎡', qty: 7, color: '#7a7570', accent: '#6a6560', pat: 'tile' },
          { id: 'bt2f2', name: '木纹防滑砖', brand: '马可波罗', model: 'BF-W02', price: 288, unit: '㎡', qty: 7, color: '#a89880', accent: '#988870', pat: 'wood' },
          { id: 'bt2f3', name: '水磨石砖', brand: '蒙娜丽莎', model: 'BF-T03', price: 328, unit: '㎡', qty: 7, color: '#c8c2ba', accent: '#b8b2aa', pat: 'terrazzo' },
        ]
      },
      {
        id: 'wall', name: '墙砖', icon: '▦', options: [
          { id: 'bt2w1', name: '白色亮面砖', brand: '东鹏', model: 'BW-W01', price: 168, unit: '㎡', qty: 24, color: '#f0ece8', accent: '#e8e4e0', pat: 'glossy' },
          { id: 'bt2w2', name: '浅灰哑光砖', brand: '诺贝尔', model: 'BW-G02', price: 198, unit: '㎡', qty: 24, color: '#c8c4c0', accent: '#bab6b2', pat: 'matte' },
          { id: 'bt2w3', name: '奶油色微水泥', brand: '磐多魔', model: 'BW-C03', price: 380, unit: '㎡', qty: 24, color: '#ddd5ca', accent: '#cec6ba', pat: 'concrete' },
        ]
      },
      {
        id: 'vanity', name: '浴室柜', icon: '▤', options: [
          { id: 'bt2v1', name: '白色悬挂式 100cm', brand: 'TOTO', model: 'LDSW801', price: 12800, unit: '套', qty: 1, color: '#f0ece6', accent: '#e5e0da', pat: 'white' },
          { id: 'bt2v2', name: '木纹落地式 120cm', brand: '箭牌', model: 'AE2509', price: 8200, unit: '套', qty: 1, color: '#a08060', accent: '#8b7050', pat: 'wood' },
          { id: 'bt2v3', name: '岩板一体盆 100cm', brand: '恒洁', model: 'HBM-901', price: 15800, unit: '套', qty: 1, color: '#8a8580', accent: '#7a7570', pat: 'sintered' },
        ]
      },
      {
        id: 'toilet', name: '马桶', icon: '◯', options: [
          { id: 'bt2t1', name: '智能马桶一体机', brand: 'TOTO', model: 'CES99', price: 16800, unit: '台', qty: 1, color: '#f5f2ef', accent: '#eae7e2', pat: 'smart' },
          { id: 'bt2t2', name: '壁挂式马桶', brand: '杜拉维特', model: 'ME-252009', price: 12600, unit: '台', qty: 1, color: '#f0ede8', accent: '#e5e2dc', pat: 'wallhung' },
          { id: 'bt2t3', name: '普通连体马桶', brand: '科勒', model: 'K-5171T', price: 4800, unit: '台', qty: 1, color: '#f2efea', accent: '#e8e5e0', pat: 'standard' },
        ]
      },
      {
        id: 'shower', name: '淋浴', icon: '⊕', options: [
          { id: 'bt2s1', name: '恒温花洒套装', brand: '汉斯格雅', model: 'RD-S240', price: 8800, unit: '套', qty: 1, color: '#c0c0c5', accent: '#aaaaaf', pat: 'chrome' },
          { id: 'bt2s2', name: '黑色暗装花洒', brand: '科勒', model: 'K-77982T', price: 12800, unit: '套', qty: 1, color: '#3a3a3a', accent: '#2a2a2a', pat: 'black' },
          { id: 'bt2s3', name: '钢琴键花洒系统', brand: '摩恩', model: 'PK-600', price: 6800, unit: '套', qty: 1, color: '#e0e0e2', accent: '#d0d0d2', pat: 'piano' },
        ]
      },
    ],
    defaults: { floor: 'bt2f1', wall: 'bt2w1', vanity: 'bt2v1', toilet: 'bt2t1', shower: 'bt2s1' },
  },
};

const ROOM_ORDER = ['living', 'bedroom1f', 'bath1f', 'master2f', 'bath2f'];
const fmt = (n: number) => n.toLocaleString('zh-CN');

function getOpt(room: string, catId: string, optId: string): RoomOption | undefined {
  const cat = ROOM_DATA[room]?.categories.find(c => c.id === catId);
  return cat?.options.find(o => o.id === optId);
}

function calcRoomTotal(room: string, sel: Record<string, string>): number {
  return Object.entries(sel).reduce((s, [c, o]) => {
    const op = getOpt(room, c, o);
    return s + (op ? op.price * op.qty : 0);
  }, 0);
}

// ═══════════════════════════════════════════════
// Panorama Viewer (Three.js equirectangular)
// ═══════════════════════════════════════════════

interface PanoViewerProps {
  panoUrl: string;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
}

function PanoViewer({ panoUrl, onLoadStart, onLoadEnd }: PanoViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const threeRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    sphere: THREE.Mesh;
    loader: THREE.TextureLoader;
    geometry: THREE.SphereGeometry;
    material: THREE.MeshBasicMaterial;
  } | null>(null);
  const rafRef = useRef(0);
  const drag = useRef({ active: false, px: 0, py: 0, vx: 0, vy: 0, lon: 0, lat: 0, fov: 75 });

  // Scene init (runs once, no texture loading here)
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1100);
    camera.position.set(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const geometry = new THREE.SphereGeometry(500, 64, 32);
    geometry.scale(-1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    const loader = new THREE.TextureLoader();
    threeRef.current = { renderer, scene, camera, sphere, loader, geometry, material };

    const d = drag.current;
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);

      if (!d.active) {
        d.vx *= 0.95;
        d.vy *= 0.95;
        d.lon += d.vx;
        d.lat += d.vy;
      }
      if (!d.active && Math.abs(d.vx) < 0.01 && Math.abs(d.vy) < 0.01) {
        d.lon += 0.015;
      }
      d.lat = Math.max(-85, Math.min(85, d.lat));

      camera.fov += (d.fov - camera.fov) * 0.1;
      camera.updateProjectionMatrix();

      const phi = THREE.MathUtils.degToRad(90 - d.lat);
      const theta = THREE.MathUtils.degToRad(d.lon);
      camera.lookAt(new THREE.Vector3(
        500 * Math.sin(phi) * Math.cos(theta),
        500 * Math.cos(phi),
        500 * Math.sin(phi) * Math.sin(theta),
      ));
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const onResize = () => {
      if (!container) return;
      const cw = container.clientWidth, ch = container.clientHeight;
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      renderer.setSize(cw, ch);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(rafRef.current);
      container.removeChild(renderer.domElement);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      threeRef.current = null;
    };
  }, []);

  // Load / switch panorama texture
  useEffect(() => {
    const three = threeRef.current;
    if (!three) return;

    onLoadStart?.();
    three.loader.load(
      panoUrl,
      (texture) => {
        if (!threeRef.current) return; // unmounted
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        const mat = threeRef.current.material;
        if (mat.map) mat.map.dispose();
        mat.map = texture;
        mat.color.set(0xffffff);
        mat.needsUpdate = true;
        onLoadEnd?.();
      },
      undefined,
      (err) => {
        console.error('[PanoViewer] texture load failed:', panoUrl, err);
        onLoadEnd?.();
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panoUrl]);

  // Pointer events
  const onPointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const d = drag.current;
    d.active = true; d.vx = 0; d.vy = 0;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    d.px = clientX; d.py = clientY;
  }, []);

  const onPointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const d = drag.current;
    if (!d.active) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const dx = (clientX - d.px) * 0.15;
    const dy = (clientY - d.py) * 0.15;
    d.lon -= dx; d.lat += dy;
    d.vx = -dx; d.vy = dy;
    d.px = clientX; d.py = clientY;
  }, []);

  const onPointerUp = useCallback(() => { drag.current.active = false; }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    drag.current.fov = Math.max(30, Math.min(100, drag.current.fov + e.deltaY * 0.05));
  }, []);

  return (
    <div
      ref={mountRef}
      onMouseDown={onPointerDown}
      onMouseMove={onPointerMove}
      onMouseUp={onPointerUp}
      onMouseLeave={onPointerUp}
      onTouchStart={onPointerDown}
      onTouchMove={onPointerMove}
      onTouchEnd={onPointerUp}
      onWheel={onWheel}
      style={{ width: '100%', height: '100%', cursor: 'grab', touchAction: 'none' }}
    />
  );
}

// ═══════════════════════════════════════════════
// Order Modal
// ═══════════════════════════════════════════════

interface OrderModalProps {
  allSel: Record<string, Record<string, string>>;
  activeRoom: string;
  onClose: () => void;
}

function OrderModal({ allSel, activeRoom, onClose }: OrderModalProps) {
  const roomData = ROOM_DATA[activeRoom];
  const sel = allSel[activeRoom];
  const items = Object.entries(sel).map(([c, o]) => {
    const cat = roomData.categories.find(x => x.id === c);
    const opt = cat?.options.find(x => x.id === o);
    return opt ? { catName: cat!.name, ...opt } : null;
  }).filter(Boolean) as (RoomOption & { catName: string })[];
  const roomTotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const grandTotal = ROOM_ORDER.reduce((s, r) => s + calcRoomTotal(r, allSel[r]), 0);

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ width: '92%', maxWidth: 500, maxHeight: '85vh', background: '#141a18', borderRadius: 18, border: '1px solid rgba(45,212,168,0.12)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>选配清单 · {roomData.name}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 3 }}>贵阳远洋天铂 · A2户型 · 138㎡</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 22px' }}>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', borderBottom: i < items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 7, background: item.color, border: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>
                    <span style={{ color: 'rgba(255,255,255,0.3)', marginRight: 5, fontSize: 10.5 }}>{item.catName}</span>
                    {item.name}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{item.brand} · {item.model} · x{item.qty}{item.unit}</div>
                </div>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>¥{fmt(item.price * item.qty)}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: '14px 22px 18px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(45,212,168,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{roomData.name}小计</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>¥{fmt(roomTotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>全屋总计（5间）</span>
            <span style={{ fontSize: 26, fontWeight: 800, color: '#2dd4a8', fontVariantNumeric: 'tabular-nums' }}>¥{fmt(grandTotal)}</span>
          </div>
          <button style={{ width: '100%', padding: '13px 0', borderRadius: 11, background: 'linear-gradient(135deg,#2dd4a8,#1ab894)', border: 'none', color: '#0a0f0d', fontSize: 14.5, fontWeight: 700, cursor: 'pointer', letterSpacing: 2 }}>
            确认方案 · 生成施工工单
          </button>
          <p style={{ textAlign: 'center', marginTop: 7, marginBottom: 0, fontSize: 10.5, color: 'rgba(255,255,255,0.2)' }}>
            确认后将自动生成材料采购单、施工工序及验收标准
          </p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// Main Page Component
// ═══════════════════════════════════════════════

export default function YuanyangPage() {
  const [activeRoom, setActiveRoom] = useState('living');
  const [allSel, setAllSel] = useState<Record<string, Record<string, string>>>(() => {
    const s: Record<string, Record<string, string>> = {};
    ROOM_ORDER.forEach(r => { s[r] = { ...ROOM_DATA[r].defaults }; });
    return s;
  });
  const [activeCat, setActiveCat] = useState(() => ROOM_DATA.living.categories[0].id);
  const [showOrder, setShowOrder] = useState(false);
  const [showPanel, setShowPanel] = useState(true);
  const [loading, setLoading] = useState(true);

  const roomData = ROOM_DATA[activeRoom];
  const sel = allSel[activeRoom];
  const cat = roomData.categories.find(c => c.id === activeCat);
  const grandTotal = useMemo(() => ROOM_ORDER.reduce((s, r) => s + calcRoomTotal(r, allSel[r]), 0), [allSel]);

  const switchRoom = (roomId: string) => {
    setActiveRoom(roomId);
    setActiveCat(ROOM_DATA[roomId].categories[0].id);
  };

  const updateSel = (optId: string) => {
    setAllSel(prev => ({ ...prev, [activeRoom]: { ...prev[activeRoom], [activeCat]: optId } }));
  };

  const handleLoadStart = useCallback(() => setLoading(true), []);
  const handleLoadEnd = useCallback(() => setLoading(false), []);

  return (
    <div style={{ width: '100%', height: '100dvh', display: 'flex', flexDirection: 'column', background: '#0a0f0d', overflow: 'hidden', position: 'relative', fontFamily: "'Noto Sans SC',-apple-system,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;600;700;800&display=swap');
        .yy-page *{box-sizing:border-box;margin:0}
        .yy-page ::-webkit-scrollbar{height:3px;width:3px}
        .yy-page ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:3px}
        .yy-cat-scroll::-webkit-scrollbar{display:none}
        .yy-opt-scroll::-webkit-scrollbar{display:none}
      `}</style>

      <div className="yy-page" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>

        {/* Panorama viewer - full background */}
        <div style={{ position: 'absolute', inset: 0 }}>
          <PanoViewer
            panoUrl={roomData.pano}
            onLoadStart={handleLoadStart}
            onLoadEnd={handleLoadEnd}
          />
        </div>

        {/* Loading overlay */}
        {loading && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,15,13,0.85)', transition: 'opacity 0.5s ease' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 44, height: 44, border: '3px solid rgba(45,212,168,0.15)', borderTopColor: '#2dd4a8',
                borderRadius: '50%', animation: 'yy-spin 0.8s linear infinite', margin: '0 auto 14px',
              }} />
              <style>{`@keyframes yy-spin{to{transform:rotate(360deg)}}`}</style>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', letterSpacing: 2 }}>加载全景图...</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>{roomData.name} · 高清全景</div>
            </div>
          </div>
        )}

        {/* Top bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(180deg,rgba(10,15,13,0.85),transparent)', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 30, height: 30, borderRadius: 7, background: 'linear-gradient(135deg,#2dd4a8,#1ab894)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#0a0f0d' }}>狸</div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#fff', lineHeight: 1.2 }}>河狸云 · 个性化精装</div>
              <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.3)' }}>贵阳远洋天铂 · A2户型 · 138㎡</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setShowPanel(!showPanel)}
              style={{ padding: '5px 12px', borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.55)', fontSize: 11, cursor: 'pointer' }}
            >
              {showPanel ? '隐藏' : '选配'}
            </button>
            <button
              onClick={() => setShowOrder(true)}
              style={{ padding: '5px 12px', borderRadius: 7, background: 'rgba(45,212,168,0.12)', border: '1px solid rgba(45,212,168,0.25)', color: '#2dd4a8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              清单 ¥{fmt(grandTotal)}
            </button>
          </div>
        </div>

        {/* Scene label */}
        <div style={{ position: 'absolute', top: 56, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)', padding: '5px 18px', borderRadius: 18, color: 'white', fontSize: 12, fontWeight: 500, letterSpacing: 4, zIndex: 8 }}>
          {roomData.label}
        </div>

        {/* Interaction hint */}
        <div style={{ position: 'absolute', top: 56, right: 14, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', padding: '4px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.06)', zIndex: 8 }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>拖拽旋转 · 滚轮缩放</span>
        </div>

        {/* Compass */}
        <div style={{ position: 'absolute', bottom: showPanel ? 210 : 70, right: 14, width: 40, height: 40, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, transition: 'bottom 0.3s ease' }}>
          <svg width="18" height="18" viewBox="0 0 20 20">
            <polygon points="10,2 7,12 10,10 13,12" fill="#2dd4a8" opacity="0.8" />
            <polygon points="10,18 7,8 10,10 13,8" fill="rgba(255,255,255,0.3)" />
          </svg>
        </div>

        {/* Room navigation tabs */}
        <div style={{ position: 'absolute', bottom: showPanel ? 195 : 14, left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', gap: 4, padding: 5, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)', borderRadius: 10, transition: 'bottom 0.3s ease' }}>
          {ROOM_ORDER.map(r => (
            <button
              key={r}
              onClick={() => switchRoom(r)}
              style={{
                padding: '5px 14px', borderRadius: 7,
                background: activeRoom === r ? 'rgba(45,212,168,0.18)' : 'transparent',
                border: activeRoom === r ? '1px solid rgba(45,212,168,0.35)' : '1px solid transparent',
                color: activeRoom === r ? '#2dd4a8' : 'rgba(255,255,255,0.35)',
                fontSize: 11, fontWeight: activeRoom === r ? 600 : 400,
                cursor: 'pointer', opacity: activeRoom === r ? 1 : 0.55,
                whiteSpace: 'nowrap', transition: 'all 0.2s ease',
              }}
            >
              {ROOM_DATA[r].name}
            </button>
          ))}
        </div>

        {/* Material configurator panel */}
        {showPanel && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 5,
            background: 'linear-gradient(180deg,rgba(10,15,13,0.8),rgba(10,15,13,0.97) 35%)',
            backdropFilter: 'blur(18px)',
            padding: '10px 14px 14px',
            borderTop: '1px solid rgba(255,255,255,0.05)',
          }}>
            {/* Category tabs */}
            <div className="yy-cat-scroll" style={{ display: 'flex', gap: 4, paddingBottom: 8, overflowX: 'auto' }}>
              {roomData.categories.map(c => (
                <button
                  key={c.id}
                  onClick={() => setActiveCat(c.id)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    padding: '6px 13px', borderRadius: 9,
                    border: activeCat === c.id ? '1.5px solid #2dd4a8' : '1.5px solid rgba(255,255,255,0.06)',
                    background: activeCat === c.id ? 'rgba(45,212,168,0.08)' : 'rgba(255,255,255,0.02)',
                    color: activeCat === c.id ? '#2dd4a8' : 'rgba(255,255,255,0.5)',
                    cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 11,
                  }}
                >
                  <span style={{ fontSize: 16 }}>{c.icon}</span>
                  <span style={{ fontWeight: 500 }}>{c.name}</span>
                </button>
              ))}
            </div>

            {/* Option cards */}
            <div className="yy-opt-scroll" style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 4 }}>
              {cat?.options.map(opt => {
                const on = sel[activeCat] === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => updateSel(opt.id)}
                    style={{
                      flex: '0 0 auto', width: 122, padding: 9, borderRadius: 11,
                      border: on ? '2px solid #2dd4a8' : '2px solid rgba(255,255,255,0.05)',
                      background: on ? 'rgba(45,212,168,0.06)' : 'rgba(255,255,255,0.015)',
                      cursor: 'pointer', textAlign: 'left' as const, position: 'relative' as const, overflow: 'hidden',
                    }}
                  >
                    {/* Color swatch */}
                    <div style={{
                      width: '100%', height: 36, borderRadius: 5, marginBottom: 7,
                      background: opt.color, border: '1px solid rgba(0,0,0,0.06)', position: 'relative', overflow: 'hidden',
                    }}>
                      {opt.pat === 'wood' && <div style={{ position: 'absolute', inset: 0, opacity: 0.18, background: `repeating-linear-gradient(0deg,transparent,transparent 3px,${opt.accent} 3px,${opt.accent} 4px)` }} />}
                      {opt.pat === 'marble' && <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.18 }} viewBox="0 0 122 36"><path d={`M0,12 Q30,4 60,16 T122,12`} stroke={opt.accent} strokeWidth="1" fill="none" /></svg>}
                      {opt.pat === 'terrazzo' && <div style={{ position: 'absolute', inset: 0 }}>{[...Array(7)].map((_, i) => <div key={i} style={{ position: 'absolute', left: `${(i * 31 + 8) % 82}%`, top: `${(i * 41 + 12) % 65}%`, width: 3 + i % 3 * 1.5, height: 3 + i % 3 * 1.5, borderRadius: '40%', background: '#888', opacity: 0.28 }} />)}</div>}
                      {opt.pat === 'herringbone' && <div style={{ position: 'absolute', inset: 0, opacity: 0.15, background: 'repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(0,0,0,0.08) 4px,rgba(0,0,0,0.08) 5px)' }} />}
                      {opt.pat === 'tile' && <div style={{ position: 'absolute', inset: 0, opacity: 0.1, background: 'repeating-linear-gradient(0deg,transparent,transparent 8px,rgba(0,0,0,0.15) 8px,rgba(0,0,0,0.15) 9px),repeating-linear-gradient(90deg,transparent,transparent 12px,rgba(0,0,0,0.15) 12px,rgba(0,0,0,0.15) 13px)' }} />}
                      {opt.pat === 'concrete' && <div style={{ position: 'absolute', inset: 0, opacity: 0.06, background: 'radial-gradient(circle at 30% 40%,rgba(0,0,0,0.15),transparent 60%)' }} />}
                    </div>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: on ? '#2dd4a8' : 'rgba(255,255,255,0.8)', marginBottom: 2, lineHeight: 1.3 }}>{opt.name}</div>
                    <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.35)' }}>{opt.brand} · {opt.model}</div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: on ? '#2dd4a8' : 'rgba(255,255,255,0.55)', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
                      ¥{fmt(opt.price)}<span style={{ fontSize: 9.5, fontWeight: 400 }}>/{opt.unit}</span>
                    </div>
                    {on && <div style={{ position: 'absolute', top: 5, right: 5, width: 16, height: 16, borderRadius: '50%', background: '#2dd4a8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#0a0f0d' }}>✓</div>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Order modal */}
        {showOrder && <OrderModal allSel={allSel} activeRoom={activeRoom} onClose={() => setShowOrder(false)} />}
      </div>
    </div>
  );
}
