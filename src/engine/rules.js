// All house-rule variations live here. Everything is overridable from the Settings screen.
export const DEFAULT_RULES = {
  target: 101, // match ends when a team reaches this many points
  scoreMode: 'winner', // 'winner': winning team of a hand writes points; first to target wins.
  //                      'loser' : "Козёл"-style — the team that LOST the hand writes points; first to target LOSES.
  firstTile: 'lowest-double', // first hand: holder of 1-1 opens ('lowest-double' | '6-6')
  outScoring: 'opponents', // going out: winners write pips left in opponents' hands ('opponents' | 'all-others')
  fishScoring: 'opponents', // block: winning team writes pips of the opponents ('opponents' | 'all')
  fishTie: 'none', // lowest hand tied between teams: nobody scores
  blankBlank: 10, // value of the 0-0 tile when counting pips left in hands
  sixSix: 12, // value of the 6-6 tile (some play 50)
  roundTo5: false, // round every hand score to the nearest 5
  outBonus00: 0, // extra points for going out with 0-0 as the last tile
  nextLeaderAfterFish: 'winner', // who opens after a block: 'winner' (lowest hand) | 'same'
};

export const RULE_LABELS = {
  target: { ru: 'До скольки очков играем', type: 'number', min: 21, max: 301 },
  scoreMode: {
    ru: 'Кто записывает очки',
    type: 'select',
    options: [
      ['winner', 'Выигравшая раздачу пара записывает очки, первый до 101 — победитель'],
      ['loser', 'Проигравшая раздачу пара записывает очки, первый до 101 — «козёл» (проиграл)'],
    ],
  },
  firstTile: {
    ru: 'Кто начинает первую раздачу',
    type: 'select',
    options: [
      ['lowest-double', 'Обладатель дубля 1-1'],
      ['6-6', 'Обладатель дубля 6-6'],
    ],
  },
  outScoring: {
    ru: 'Очки при «домино» (игрок вышел)',
    type: 'select',
    options: [
      ['opponents', 'Сумма очков на руках у двух соперников'],
      ['all-others', 'Сумма очков у всех остальных (соперники + партнёр)'],
    ],
  },
  fishScoring: {
    ru: 'Очки при «рыбе» (блок)',
    type: 'select',
    options: [
      ['opponents', 'Выигрывает пара игрока с минимальной рукой; записывает очки соперников'],
      ['all', 'Выигрывает пара игрока с минимальной рукой; записывает все 4 руки'],
    ],
  },
  blankBlank: { ru: 'Стоимость 0-0 в конце раздачи', type: 'number', min: 0, max: 50 },
  sixSix: { ru: 'Стоимость 6-6 в конце раздачи (12 или 50)', type: 'number', min: 12, max: 50 },
  roundTo5: { ru: 'Округлять очки раздачи до 5', type: 'bool' },
  outBonus00: { ru: 'Бонус за выход последним камнем 0-0', type: 'number', min: 0, max: 50 },
  nextLeaderAfterFish: {
    ru: 'Кто ходит первым после «рыбы»',
    type: 'select',
    options: [
      ['winner', 'Игрок с наименьшей рукой'],
      ['same', 'Тот же, кто начинал'],
    ],
  },
};

export function mergeRules(over = {}) {
  return { ...DEFAULT_RULES, ...over };
}
