// The four retailers and how to reach their online stores.
// Branch (store) ids matter: online prices differ by branch. Override with env vars.
import { ramiLevySource } from './ramiLevy.js';
import { zuzSource } from './zuz.js';
import { demoSource } from './demo.js';

export function getSources(env = process.env) {
  if (env.DEMO === '1') return ['rami_levy', 'victory', 'super_tal', 'carrefour'].map((id) => demoSource(id));

  const sources = [
    ramiLevySource({ storeId: env.RAMI_LEVY_STORE_ID ?? '331', token: env.RAMI_LEVY_TOKEN }),
    zuzSource({
      id: 'victory', name: 'ויקטורי', nameEn: 'Victory',
      baseUrl: 'https://www.victoryonline.co.il', retailerId: 1470,
      branchId: env.VICTORY_BRANCH_ID ?? '2930',
    }),
  ];

  // Super Tal: no confirmed online-store API yet. If its site runs on the same
  // platform as Victory/Carrefour (URLs like /v2/retailers/<id>/...), set these.
  if (env.SUPER_TAL_SITE_URL && env.SUPER_TAL_RETAILER_ID && env.SUPER_TAL_BRANCH_ID) {
    sources.push(zuzSource({
      id: 'super_tal', name: 'סופר טל', nameEn: 'Super Tal',
      baseUrl: env.SUPER_TAL_SITE_URL.replace(/\/$/, ''), retailerId: env.SUPER_TAL_RETAILER_ID,
      branchId: env.SUPER_TAL_BRANCH_ID,
    }));
  } else {
    sources.push({ id: 'super_tal', name: 'סופר טל', nameEn: 'Super Tal', disabled: 'לא הוגדר אתר אונליין (ראו README)' });
  }

  sources.push(zuzSource({
    id: 'carrefour', name: 'קרפור', nameEn: 'Carrefour',
    baseUrl: 'https://www.carrefour.co.il', retailerId: 1540,
    branchId: env.CARREFOUR_BRANCH_ID ?? '3003',
  }));
  return sources;
}
