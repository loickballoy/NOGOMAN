const Sequencer = require('@jest/test-sequencer').default;

/**
 * Runs flow.e2e-spec.ts first: it asserts global totals (platform revenue, payout batch size,
 * countrywide job search) that only hold on the freshly emptied database. The other files share
 * that database and assert relative state; they run after it, in path order.
 */
module.exports = class FlowFirstSequencer extends Sequencer {
  sort(tests) {
    const rank = (t) => (t.path.endsWith('flow.e2e-spec.ts') ? 0 : 1);
    return [...tests].sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
  }
};
