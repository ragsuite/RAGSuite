/**
 * CE stub — real coverage lives in RAGSUITE_EE `modules/voice`.
 * Keeps CE-alone Jest green when the sibling EE tree is not attached.
 */
describe('speakable-chunk (CE stub)', () => {
  it('does not run EE speakable-chunk tests without RAGSUITE_EE', () => {
    expect(true).toBe(true);
  });
});
