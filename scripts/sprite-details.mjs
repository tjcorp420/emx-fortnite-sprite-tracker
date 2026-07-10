const VARIANT_BONUS = {
  Gold: 'Gain 3x bonus XP from eliminations',
  Gummy: 'Gain 20% more Sprite Dust upon Extraction',
  Galaxy: 'Gain 30% more Ammo whenever picked up in the world',
  Holofoil: '5% chance for your squad to find rare Sprite Variants from looting chests',
};

const FAMILY_DETAILS = {
  Water: {
    ability: 'Replenish shields while standing in water!',
    effect: 'Increases in power at each Level Up: 2 Shield -> 3 Shield -> 4 Shield -> 5 Shield -> 6 Shield per tick',
    location: 'Spotted near rivers and beaches',
    baseCost: '100', variantCost: '4,000',
    drops: { Base: '12.83', Gold: '0.7', Gummy: '0.28', Galaxy: '0.28', Holofoil: '0' },
  },
  Earth: {
    ability: 'You have a chance to find additional rare items when opening chests.',
    effect: 'Chance increases at each Level Up: 10% -> 12.5% -> 15% -> 17.5% -> 20% chance to find additional rare loot',
    location: 'Found wandering around forests and wooded regions',
    baseCost: '100', variantCost: '4,000',
    drops: { Base: '12.83', Gold: '0.7', Gummy: '0.28', Galaxy: '0.28' },
  },
  Fire: {
    ability: 'Creates a fiery burst when you deal enough damage to an enemy!',
    effect: 'Required damage decreases at each Level Up: 150 Damage -> 125 Damage -> 100 Damage -> 75 Damage -> 50 Damage to trigger',
    location: 'Located near urban areas',
    baseCost: '100', variantCost: '4,000',
    drops: { Base: '12.45', Gold: '0.68', Gummy: '0.68', Galaxy: '0.27', Holofoil: '0' },
  },
  Duck: {
    ability: 'Emoting or Jamming replenishes shields.',
    effect: 'Increases in power at each Level Up: 2 Shield -> 3 Shield -> 4 Shield -> 6 Shield -> 8 Shield per tick',
    location: 'Found in the vault of a certain business mogul',
    baseCost: '3,000', variantCost: '6,000',
    drops: { Base: '5.74', Gold: '0.07', Gummy: '0.04', Galaxy: '0.02' },
  },
  Ghost: {
    ability: 'Grants cloak for a duration upon reloading.',
    effect: 'Increases in duration at each Level Up: 3 Seconds -> 3.5 Seconds -> 4 Seconds -> 4.5 Seconds -> 5 Seconds',
    location: 'Found in the world at nighttime',
    baseCost: '3,000', variantCost: '6,000',
    drops: { Base: '5.74', Gold: '0.07', Gummy: '0.04', Galaxy: '0.02', Holofoil: '0' },
  },
  Dream: {
    ability: 'Grants a random item at each level, exploding with legendary loot at Max Level.',
    effect: 'Loot value increases at each Level Up!',
    location: 'Sometimes found sleeping in the storage crates',
    baseCost: '5,000', variantCost: '10,000',
    drops: { Base: '2.63', Gold: '0.03', Gummy: '0.02', Galaxy: '0.01' },
  },
  Demon: {
    ability: 'Siphon some health and shields when you eliminate an opponent.',
    effect: 'Increases in power at each Level Up: 10 Healing -> 15 Healing -> 20 Healing -> 25 Healing -> 30 Healing per elimination',
    location: 'Found rarely in Sprite Chests',
    baseCost: '3,000', variantCost: '6,000',
    drops: { Base: '5.76', Gold: '0.07', Gummy: '0.04', Galaxy: '0.02' },
  },
  Punk: {
    ability: 'Possibly nothing... or infinitely something',
    effect: '',
    location: 'Found rarely in Sprite Chests',
    baseCost: '5,000', variantCost: '10,000',
    drops: { Base: '1.98', Gold: '0.02', Gummy: '0.01', Galaxy: '0.01' },
  },
  King: {
    ability: 'Your Pickaxe deals more damage.',
    effect: 'Increases in damage at each Level Up: 30 -> 40 -> 60 -> 80 -> 120 bonus damage',
    location: 'Found rarely in Sprite Chests',
    baseCost: '3,000', variantCost: '6,000',
    drops: { Base: '5.74', Gold: '0.07', Gummy: '0.04', Galaxy: '0.02', Holofoil: '0' },
  },
  Peanut: {
    ability: 'Goop! When eliminating players, you may find more loot. Sometimes mythic!',
    effect: 'Chance increases at each Level Up: 20% -> 30% -> 40% -> 50% -> 60% chance to find more loot. 10% chance to find Mythic at Max Level!',
    location: 'Found in Relic Chests',
    baseCost: '7,500', variantCost: '7,500',
    drops: { Base: '1.01' },
  },
  'Zero Point': {
    ability: 'Spawn a Shield Bubble Jr. when you use a healing item on yourself (excluding splashes and grenades).',
    effect: 'Increases in duration at each Level Up: 6 Seconds -> 7 Seconds -> 8 Seconds -> 9 Seconds -> 10 Seconds',
    location: 'Found rarely in Sprite Chests',
    baseCost: '7,500', variantCost: '15,000',
    drops: { Base: '0.000098', Gold: '0.0000012', Gummy: '0.0000006', Galaxy: '0.0000004' },
  },
  Fishy: {
    ability: 'Swim speed greatly increased. Taking damage also briefly increases movement speed.',
    effect: 'Increases in power at each Level Up: 25% Swim Speed / 10% Movement Speed -> 50% Swim Speed / 20% Movement Speed -> 100% Swim Speed / 30% Movement Speed -> 150% Swim Speed / 40% Movement Speed -> 200% Swim Speed / 50% Movement Speed Bonuses',
    location: 'Spotted near high and mountainous areas',
    baseCost: '2,000', variantCost: '4,000',
    drops: { Base: '13.79', Gold: '0.17', Gummy: '0.08', Galaxy: '0.06' },
  },
  Striker: {
    ability: 'Gain the Overdrive effect when you Mantle, Hurdle, or Wall Scramble.',
    effect: 'Duration increases at each Level Up: 6 Seconds -> 7 Seconds -> 8 Seconds -> 9 Seconds -> 10 Seconds of Overdrive',
    location: 'Spotted near high and mountainous areas',
    baseCost: '3,000', variantCost: '6,000',
    drops: { Base: '5.74', Gold: '0.07', Gummy: '0.04', Galaxy: '0.02', Holofoil: '0' },
  },
  Aura: {
    ability: 'Gain a Shock Rock charge when you deal enough damage to enemies!',
    effect: 'Required damage decreases at each Level Up: 175 Damage -> 150 Damage -> 125 Damage -> 100 Damage -> 75 Damage to trigger',
    location: 'Spotted near high and mountainous areas',
    baseCost: '3,000', variantCost: '6,000',
    drops: { Base: '5.74', Gold: '0.07', Gummy: '0.04', Galaxy: '0.02' },
  },
  Boss: {
    ability: 'Grants an increase to your max HP and Shield.',
    effect: 'Increases at each Level Up: 5 HP/Shield -> 10 HP/Shield -> 15 HP/Shield -> 20 HP/Shield -> 25 HP/Shield',
    location: 'Claimed from defeating a powerful adversary',
    baseCost: '5,000', variantCost: '10,000',
    drops: { Base: '2.63', Gold: '0.03', Gummy: '0.02', Galaxy: '0.01' },
  },
  Grim: {
    ability: 'Players who attack you are marked for a duration.',
    effect: 'Increases in duration at each Level Up: 3 Seconds -> 3.5 Seconds -> 4 Seconds -> 4.5 Seconds -> 5 Seconds',
    location: 'Found rarely in Sprite Chests',
    baseCost: '7,500', variantCost: '15,000',
    drops: { Base: '0.000098', Gold: '0.0000012', Gummy: '0.0000006', Galaxy: '0.0000004' },
  },
};

export function enrichRecords(records) {
  return records.map((record) => {
    if (!record.released) return record;
    const detail = FAMILY_DETAILS[record.type];
    if (!detail) return record;
    const bonus = VARIANT_BONUS[record.variant];
    const drop = detail.drops[record.variant];
    const cost = record.variant === 'Base' || record.type === 'Peanut' ? detail.baseCost : detail.variantCost;
    const abilities = [bonus, detail.ability].filter(Boolean);
    return {
      ...record,
      description: abilities[0] || detail.ability,
      stats: [`Drop chance: Sprite Chest ${drop}%`, `Summon cost: ${cost}`, `Location: ${detail.location}`],
      abilities,
      effects: detail.effect ? [detail.effect] : [],
      acquisition: `Sprite Chest ${drop}%`,
      spawnInfo: detail.location,
      dataStatus: 'verified',
    };
  });
}
