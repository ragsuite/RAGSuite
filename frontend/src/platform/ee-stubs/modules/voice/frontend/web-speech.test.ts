/**
 * CE stub — real coverage lives in RAGSUITE_EE `modules/voice`.
 * Keeps CE-alone Jest + tsc green when the sibling EE tree is not attached.
 */
describe('web-speech (CE stub)', () => {
  it('does not run EE web-speech tests without RAGSUITE_EE', () => {
    expect(true).toBe(true);
  });
});
