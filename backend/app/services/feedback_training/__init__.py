"""Admin feedback training: a per-project reward memory built from reviewed user feedback.

An admin trains a feedback explicitly; for later questions similar to the trained one the
memory (1) reorders retrieved chunks — sources cited by liked answers up, sources blamed in
disliked answers down, nothing dropped — and (2) adds style/focus preferences to the prompt.
Facts always come from the current sources; the memory never stores or injects answer text.
"""
