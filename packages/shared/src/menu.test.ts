import { describe, expect, it } from 'vitest';
import { appearsIn, menuEvidence } from './menu';

const home = { url: 'https://thaiplace.example/', text: 'Welcome to Thai Place\nVegan options available, just ask!\nWe use cookies. Privacy policy.\nGift cards for vegan friends' };
const menu = {
  url: 'https://thaiplace.example/menu',
  text: [
    'STARTERS',
    'Fresh Rolls (V) $9',
    'Chicken Satay $12',
    'NOODLES',
    'Vegan Pad See Ew - wide rice noodles, tofu, broccoli $16',
    'Pad Thai (GF) $15',
    'Tofu Larb (VG)',
    '(V) vegetarian (VG) vegan (GF) gluten free. We cannot guarantee a gluten free kitchen.',
  ].join('\n'),
};

describe('menu check', () => {
  it('finds real vegan dishes, preferring marked menu items and the menu page', () => {
    const r = menuEvidence([home, menu], 'vegan');
    expect(r.url).toBe('https://thaiplace.example/menu');
    expect(r.dishes).toContain('Tofu Larb (VG)');
    expect(r.dishes).toContain('Vegan Pad See Ew - wide rice noodles, tofu, broccoli');
    expect(r.dishes.every(d => !/\$\d/.test(d))).toBe(true);
  });

  it('treats vegan dishes as vegetarian too, and reads (GF) markers', () => {
    expect(menuEvidence([menu], 'vegetarian').dishes).toEqual(expect.arrayContaining(['Fresh Rolls (V)', 'Tofu Larb (VG)']));
    expect(menuEvidence([menu], 'gluten-free').dishes).toEqual(['Pad Thai (GF)']);
  });

  it('skips a pipe-style menu key but keeps the restaurant\'s own promise (real Greens text)', () => {
    const greens = {
      url: 'https://www.greensrestaurant.com/menu',
      text: 'Vegan and gluten-free dishes are always included, and noted on our menus as follows:\nv | vegan , vp | vegan possible, gf | gluten free, gfp | gluten free possible\nDAILY MENUS',
    };
    expect(menuEvidence([greens], 'vegan').dishes).toEqual(['Vegan and gluten-free dishes are always included, and noted on our menus as follows']);
  });

  it('handles real menus: skips bare headings and "VG = vegan" keys, and names a dish from its description', () => {
    const sewa = {
      url: 'https://www.sewacuisine.com/menu',
      text: 'Vegan\nVegetarian\nSaag Tofu\nFresh Spinach, organic Tofu, herbs and spices (can Be Vegan) $17\nGarlic Naan\nLeavened Garlic bread baked in clay oven. (can be Vegan on request) $5\nVegetarian Thali For Two $38',
    };
    const burma = { url: 'https://www.burmasuperstar.com/menu', text: 'VG = vegan.\nDietary key: V = vegetarian.\nTea Leaf Salad (VG)' };
    const vegan = menuEvidence([sewa], 'vegan').dishes;
    expect(vegan).toHaveLength(2);
    expect(vegan).toEqual(
      expect.arrayContaining([
        'Garlic Naan: Leavened Garlic bread baked in clay oven. (can be Vegan on request)',
        'Saag Tofu: Fresh Spinach, organic Tofu, herbs and spices (can Be Vegan)',
      ])
    );
    expect(menuEvidence([sewa], 'vegetarian').dishes).toContain('Vegetarian Thali For Two');
    expect(menuEvidence([sewa], 'vegetarian').dishes).not.toContain('Vegetarian');
    expect(menuEvidence([burma], 'vegan').dishes).toEqual(['Tea Leaf Salad (VG)']);
  });

  it('checks that a dish really appears on the crawled pages', () => {
    expect(appearsIn([menu], 'Tofu Larb (VG)')).toBe(true);
    expect(appearsIn([menu], 'tofu larb')).toBe(true);
    expect(appearsIn([menu], 'Vegan Lasagna')).toBe(false);
  });

  it('skips cookie banners and legal fine print, and admits when it finds nothing', () => {
    expect(menuEvidence([home], 'vegan').dishes).toEqual(['Vegan options available, just ask!']);
    expect(menuEvidence([menu], 'halal')).toEqual({ dishes: [], url: '' });
    expect(menuEvidence([], 'vegan')).toEqual({ dishes: [], url: '' });
    expect(menuEvidence([menu], 'unknown-diet')).toEqual({ dishes: [], url: '' });
  });
});
