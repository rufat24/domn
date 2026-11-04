// Signed value of a finished hand for a team: + if that team scores, - if the opponents score, 0 for a tie.
export const resolveOutValue = (res, team) => (res.team < 0 ? 0 : res.team === team ? res.points : -res.points);
