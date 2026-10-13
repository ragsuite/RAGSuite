"""Deterministic shared query processing (Chat + Search)."""
import pytest

from app.services.rag import query_signals as qs
from app.services.rag.query_processing import clean_query, process_query, strip_filler


class TestCleanQuery:
    def test_collapses_whitespace_and_repeated_punctuation(self):
        assert clean_query("  what   is\tthis??? \n") == "what is this?"

    def test_strips_emoji_and_control_but_keeps_symbols(self):
        assert clean_query("best phone 😍🔥 under ₹20,000 ★4") == "best phone under ₹20,000 ★4"
        assert clean_query("a\x00b") == "a b"

    def test_keeps_urls_codes_and_non_latin_scripts(self):
        text = "RTX4050 laptop https://example.com/a-b?x=1 价格 سعر Größe"
        assert clean_query(text) == text

    def test_nfkc_fullwidth(self):
        assert clean_query("ＲＴＸ４０５０") == "RTX4050"

    @pytest.mark.parametrize("value", [None, "", "   "])
    def test_empty(self, value):
        assert clean_query(value) == ""


class TestFiller:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("Can you tell me about the refund policy?", "the refund policy?"),
            ("Please tell me what the site says about lubricants", "lubricants"),
            ("I need details on gaming laptops", "gaming laptops"),
            ("Kannst du mir bitte sagen, wie teuer das ist?", "wie teuer das ist?"),
            ("refund policy please", "refund policy"),
        ],
    )
    def test_strip_filler(self, raw, expected):
        assert strip_filler(raw) == expected

    def test_never_empties(self):
        assert strip_filler("please") == "please"


class TestConstraints:
    @pytest.mark.parametrize(
        "text,key,value",
        [
            ("laptops under ₹50,000", "price_max", 50000),
            ("phones below 1,00,000 rupees", "price_max", 100000),
            ("TV under 50k", "price_max", 50000),
            ("Laptop unter 50.000 €", "price_max", 50000),
            ("budget 2 lakh", None, None),
            ("shoes above $100", "price_min", 100),
            ("手机 3000元以下", "price_max", 3000),
        ],
    )
    def test_prices(self, text, key, value):
        out = qs.extract_constraints(text)
        if key is None:
            assert "price_max" not in out or out["price_max"] > 0
        else:
            assert out[key] == value

    def test_between(self):
        out = qs.extract_constraints("TVs between ₹30,000 and ₹70,000")
        assert out["price_min"] == 30000 and out["price_max"] == 70000

    def test_units_are_not_prices(self):
        out = qs.extract_constraints("laptop under 2 kg with more than 16 GB RAM")
        assert "price_max" not in out and "price_min" not in out

    def test_small_bare_numbers_are_not_prices(self):
        assert qs.extract_constraints("delivered in under 5 minutes") == {}

    def test_rating(self):
        assert qs.extract_constraints("headphones with 4 stars or more")["rating_min"] == 4
        assert qs.extract_constraints("rated above 4.5")["rating_min"] == 4.5
        assert qs.extract_constraints("mindestens 4 Sterne")["rating_min"] == 4

    def test_currency_reported(self):
        assert qs.extract_constraints("under $500")["currency"] == "$"

    @pytest.mark.parametrize(
        "text,expected",
        [
            ("give me list of products available below 600rs", {"price_max": 600, "currency": "RS"}),
            ("under 500inr", {"price_max": 500, "currency": "INR"}),
            ("above 1000rs", {"price_min": 1000, "currency": "RS"}),
            ("between 300rs and 600rs", {"price_min": 300, "price_max": 600, "currency": "RS"}),
            ("between 300 rs and 600 rs", {"price_min": 300, "price_max": 600, "currency": "RS"}),
        ],
    )
    def test_currency_written_against_the_number(self, text, expected):
        assert qs.extract_constraints(text) == expected

    @pytest.mark.parametrize("text", ["serum under 600ml", "bag under 600kg", "mrs smith under 600 hours"])
    def test_glued_units_are_not_prices(self, text):
        assert qs.extract_constraints(text) == {}


class TestIntent:
    @pytest.mark.parametrize(
        "text,intent",
        [
            ("How do I get a refund?", qs.INTENT_HELP),
            ("Wie kontaktiere ich den Kundenservice?", qs.INTENT_HELP),
            ("iPhone 15 vs Galaxy S24", qs.INTENT_COMPARE),
            ("Unterschied zwischen Öl A und Öl B", qs.INTENT_COMPARE),
            ("laptops under ₹60,000", qs.INTENT_FILTER),
            ("What is the price of the Pixel 8?", qs.INTENT_ATTRIBUTE),
            ("samsung crystal 4k vision kitne ka hai", qs.INTENT_ATTRIBUTE),
            ("What is paysafecard?", qs.INTENT_DEFINITION),
            ("Qu'est-ce que le lubrifiant?", qs.INTENT_DEFINITION),
            ("Show me gaming laptops", qs.INTENT_BROWSE),
            ("hydraulic oil for tractors", qs.INTENT_GENERAL),
        ],
    )
    def test_intents(self, text, intent):
        assert process_query(text).intent == intent

    def test_explicit_multi_source(self):
        assert process_query("compare refund rules across all sources").explicit_multi_source


class TestEntitiesAndAmbiguity:
    def test_entities(self):
        pq = process_query('Is the "Galaxy S24 Ultra" better than RTX4050 laptops from Lenovo?')
        lowered = [e.lower() for e in pq.entities]
        assert "galaxy s24 ultra" in lowered
        assert "rtx4050" in lowered
        assert "lenovo" in lowered

    def test_sentence_initial_function_word_not_entity(self):
        assert "What" not in process_query("What is the warranty?").entities

    @pytest.mark.parametrize(
        "text, name",
        [
            ("What does the Bling Leader Illuminating Moisturizer cost?", "Bling Leader Illuminating Moisturizer"),
            ("What is the price of the Born To Wing Gel Eyeliner?", "Born To Wing Gel Eyeliner"),
            ("Is the Trail Runner Pro Max Ultra Light waterproof?", "Trail Runner Pro Max Ultra Light"),
        ],
    )
    def test_multi_word_name_stays_whole(self, text, name):
        assert process_query(text).entities == [name]

    def test_lowercase_words_separate_names(self):
        entities = process_query("Which is lighter, the Acme Nova or the Moto Edge?").entities
        assert entities == ["Acme Nova", "Moto Edge"]

    @pytest.mark.parametrize(
        "text",
        [
            "Is it cheaper?",
            "Which one is better?",
            "What about the price?",
            "How much does it cost?",
            "Gibt es das in Blau?",
            "Is that one compatible?",
        ],
    )
    def test_ambiguous_references(self, text):
        assert process_query(text).is_ambiguous_ref

    @pytest.mark.parametrize(
        "text",
        [
            "What can I buy here?",
            "How do I get a refund?",
            "What is the price of the Pixel 8?",
            "Is the Fuchs Titan oil compatible with diesel engines?",
            "laptops under ₹50,000",
            "Show me gaming laptops",
        ],
    )
    def test_not_ambiguous(self, text):
        assert not process_query(text).is_ambiguous_ref

    def test_simple_vs_complex(self):
        assert process_query("What is paysafecard?").is_simple
        assert not process_query("laptops under ₹50,000").is_simple
        assert process_query("laptops under ₹50,000").is_high_risk


class TestProcessQueryContract:
    def test_original_preserved(self):
        raw = "  Can you tell me about RTX4050 laptops??  "
        pq = process_query(raw)
        assert pq.original == raw
        assert pq.processed == "Can you tell me about RTX4050 laptops?"
        assert pq.retrieval_query == "RTX4050 laptops?"

    def test_empty_query(self):
        pq = process_query("")
        assert pq.processed == "" and pq.retrieval_query == "" and not pq.is_ambiguous_ref

    def test_language_detection_and_hint(self):
        assert process_query("Wie hoch ist der Preis für das Öl?").language == "de"
        assert process_query("RTX4050", language_hint="fr-FR").language == "fr"

    def test_to_meta_is_json_safe(self):
        import json

        meta = process_query("laptops under ₹50,000 with 4 stars").to_meta()
        json.dumps(meta)
        assert meta["query_intent"] == qs.INTENT_FILTER
        assert meta["constraints"]["price_max"] == 50000
