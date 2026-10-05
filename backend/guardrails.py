import re
from dataclasses import dataclass

MAX_QUESTION_CHARS = 1000

INJECTION_PATTERNS = [
    r"\b(ignore|disregard|forget)\b.{0,40}\b(previous|prior|above|earlier|all)\b.{0,20}\b(instruction|prompt|rule)s?\b",
    r"\b(reveal|show|print|repeat|leak|display)\b.{0,20}\b(system|hidden)\s+(prompt|instruction)s?\b",
    r"\b(reveal|show|print|repeat|leak)\b.{0,15}\byour\s+(prompt|instruction)s?\b",
    r"\byou are now\b",
    r"\bpretend (to be|you are)\b",
    r"\bdeveloper mode\b",
    r"\bjailbreak\b",
    r"\b(ignore|disregard|forget)\b.{0,30}\b(everything|anything|all)\b.{0,30}\b(told|said|given|above|before|earlier)\b",
]

SENSITIVE_PATTERNS = [
    r"\b(?:\d[ -]?){13,16}\b",
    r"\b\d{5}-\d{7}-\d\b",
    r"\b\d{3}-\d{2}-\d{4}\b",
]

CITATION_RE = re.compile(r"[\[【]\s*(\d+)\s*[\]】]")
FACT_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+|https?://\S+|\d[\d,./-]*\d")
REFUSAL = "I couldn't find that information"


def check_output(answer: str, sources) -> tuple[str, list[str]]:
    warnings: list[str] = []
    answer = CITATION_RE.sub(lambda m: f"[{m.group(1)}]", answer)

    if not isinstance(sources, dict) or answer.strip().startswith(REFUSAL):
        return answer, warnings

    valid = set(sources.keys())

    def keep(m):
        if int(m.group(1)) in valid:
            return m.group(0)
        warnings.append(f"invalid citation [{m.group(1)}]")
        return ""

    answer = re.sub(r"\[(\d+)\]", keep, answer)

    context = " ".join(d.page_content for d in sources.values()).lower()
    text = re.sub(r"\[\d+\]", "", answer).lower()
    unverified = sorted({
        t.rstrip(".,)*_;:") for t in FACT_RE.findall(text)
        if t.rstrip(".,)*_;:") not in context
    })
    if unverified:
        warnings.append(f"unverified details: {unverified}")
        answer += "\n\n_Note: some details in this answer could not be verified in the source text._"
    return answer, warnings

@dataclass
class GuardResult:
    allowed: bool
    text: str
    reason: str | None = None


def check_input(question: str) -> GuardResult:
    text = (question or "").strip()
    if not text:
        return GuardResult(False, text, "Please type a question.")
    if len(text) > MAX_QUESTION_CHARS:
        return GuardResult(False, text, f"Please keep your question under {MAX_QUESTION_CHARS} characters.")

    lowered = text.lower()
    for pattern in INJECTION_PATTERNS:
        if re.search(pattern, lowered):
            return GuardResult(
                False, text,
                "That looks like an attempt to override my instructions, so I can't help with it. "
                "Ask me a question about your documents instead.",
            )

    for pattern in SENSITIVE_PATTERNS:
        text = re.sub(pattern, "[REDACTED]", text)
    return GuardResult(True, text)