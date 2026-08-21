/**
 * Re-exports EE web-speech unit coverage when RAGSUITE_EE is present.
 * CE-alone CI resolves this to the stub test below via @ragsuite-ee path mapping.
 */
export * from '@ragsuite-ee/modules/voice/frontend/web-speech.test';
