"""Per-language stop words for keyword retrieval.

Function words, question words and request verbs ("brauchen", "lautet", "need") carry
no topic, yet they match almost every passage in their language and crowd the real
search terms out of the keyword query. Lists are lowercase; tokens are compared after
lowercasing. Product words that double as function words elsewhere (German "Art" as
in "Art.-Nr.") are deliberately absent.
"""
from __future__ import annotations

from typing import Dict, FrozenSet

_RAW: Dict[str, str] = {
    "en": """
        a an the is are was were be been being am have has had having do does did doing
        will would should could may might must can shall if in on at to for of with by
        from as into onto about over under after before between through during without
        i you he she it we they me him her us them my your his its our their mine yours
        what when where why how who whom whose which this that these those there here
        and or but not no nor so yet both either neither just also very too than then
        any some all each every more most much many such own same other only
        please tell show give find need want get got know let make like
        dont doesnt isnt arent im ive youre whats hows
    """,
    "de": """
        der die das den dem des ein eine einen einem einer eines kein keine keinen
        keinem keiner keines und oder aber auch noch nur schon sehr mehr viel viele
        wie was wer wen wem wessen wo wann warum wieso weshalb woher wohin womit wofür
        worüber welche welcher welches welchen welchem ist sind war waren bin bist
        seid sein gewesen wird werden wurde wurden worden hat haben hatte hatten habe
        hast kann können konnte konnten darf dürfen durfte muss müssen musste soll
        sollen sollte sollten will wollen wollte möchte möchten mag mögen ich du er
        sie es wir ihr mich dich sich uns euch mir dir ihm ihn ihnen mein meine meinen
        meinem meiner dein deine seine seinen seinem seiner ihre ihren ihrem ihrer
        unser unsere unseren unserem unserer euer eure in im ins an am auf aus bei
        beim mit nach von vom zu zum zur für über unter vor hinter neben zwischen
        durch gegen ohne um bis seit als wenn dass ob weil damit denn doch ja nein
        nicht nichts man dies diese dieser dieses diesen diesem jede jeder jedes
        jeden alle allem allen gibt bitte lautet lauten heißt heisst nennt brauche
        brauchen braucht benötige benötigen benötigt gerne gern etwa etwas hier dort
        da dann so also bzw sowie welcherlei
    """,
    "fr": """
        le la les un une des du de et ou mais donc ni car que qui quoi quel quelle
        quels quelles comment pourquoi où quand est sont était étaient être avoir ai
        as avons avez ont fait faire peut peuvent pouvez puis doit dois devons devez
        veux voulez voudrais je tu il elle on nous vous ils elles me te se moi toi
        lui leur leurs mon ma mes ton ta tes son sa ses notre nos votre vos ce cet
        cette ces ceci cela ça dans en sur sous avec pour par sans chez vers entre au
        aux pas ne plus très bien aussi y svp merci besoin
    """,
    "es": """
        el la los las lo un una unos unas de del al y o pero que qué quien quién cual
        cuál cuales cuáles como cómo donde dónde cuando cuándo por para con sin sobre
        entre en es son era ser estar está están hay tiene tienen tengo puedo puede
        pueden necesito necesita quiero yo tú él ella nosotros ustedes usted ellos me
        te se mi mis tu tus su sus nuestro nuestra este esta estos estas ese esa eso
        no sí muy más también favor
    """,
    "pt": """
        o a os as um uma uns umas de do da dos das no na nos nas em ao aos e ou mas
        que qual quais quem como onde quando por para com sem sobre entre é são era
        ser estar está estão há tem têm tenho posso pode podem preciso precisa quero
        eu tu ele ela nós você vocês eles me te se meu minha seu sua nosso nossa este
        esta isso isto não sim muito mais também favor
    """,
    "it": """
        il lo la i gli le un uno una di del della dello dei degli delle a al alla ai
        agli alle da dal dalla in nel nella nei su sul sulla con per tra fra e o ma
        che chi cosa quale quali come dove quando perché è sono era essere avere ha
        hanno ho posso può possono vorrei voglio serve io tu lui lei noi voi loro mi
        ti si mio mia suo sua nostro nostra questo questa quello quella non sì molto
        più anche
    """,
    "nl": """
        de het een en of maar dat die dit deze wat welke wie hoe waar waarom wanneer
        is zijn was waren ben bent wordt worden heeft hebben had heb kan kunnen moet
        moeten mag mogen wil willen zou zouden ik jij je hij zij ze wij we jullie u
        mij me hem haar ons hun mijn jouw uw onze van in op aan met voor bij naar uit
        over onder door om tot te niet geen ook nog wel er hier daar dan als graag
        alstublieft nodig
    """,
}

STOPWORDS: Dict[str, FrozenSet[str]] = {
    lang: frozenset(words.split()) for lang, words in _RAW.items()
}

# English function words show up in queries of every language (brand slogans, UI terms),
# so they are always filtered in addition to the query language's own list.
BASE_LANGUAGE = "en"


def stopwords_for(lang: str | None) -> FrozenSet[str]:
    """Stop words for ``lang`` plus the always-on English list."""
    base = STOPWORDS[BASE_LANGUAGE]
    extra = STOPWORDS.get(lang or "")
    return base | extra if extra else base
