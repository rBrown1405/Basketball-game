const PBC = require('./harness');
const S = PBC.League.create({ leagueKey: 'men', seed: 3 });
S.userTid = 5;
PBC.Coach.create(S, 'Test', 5);
PBC.Season.startRegularSeason(S);
console.log('expectation', JSON.stringify(S.coach.expectation));
