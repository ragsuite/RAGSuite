/**
 * CE stub — real coverage lives in RAGSUITE_EE `modules/voice`.
 * Keeps CE-alone Jest green when the sibling EE tree is not attached.
 */
describe('voice-input-signal (CE stub)', () => {
  it('does not run EE voice input-signal tests without RAGSUITE_EE', () => {
    expect(true).toBe(true);
  });
});
