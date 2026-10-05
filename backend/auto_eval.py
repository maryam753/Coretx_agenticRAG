import json
import random
import re
import time

import groq
from ragas.run_config import RunConfig
from langchain_groq import ChatGroq
from ragas import evaluate, EvaluationDataset
from ragas.embeddings import LangchainEmbeddingsWrapper
from ragas.llms import LangchainLLMWrapper
from ragas.metrics import Faithfulness, AnswerRelevancy, ContextPrecision, ContextRecall
from backend.guardrails import check_output
from backend.RAG_engine import build_llm, get_embedding_model, load_groq_keys, RAGAS_JUDGE_MODEL


def generate_testset(svc, n: int = 5) -> list[dict]:
    """LLM reads random chunks and writes a question + ground truth for each."""
    llm = build_llm(RAGAS_JUDGE_MODEL)
    chunks = [c for c in svc.chunks if len(c.page_content.strip()) > 200]
    random.seed(42)
    picked = random.sample(chunks, min(n, len(chunks)))

    items = []
    for chunk in picked:
        raw = llm.invoke(
            f"""Read this passage from a document. Write ONE question that can be
answered fully and only from the passage, and the correct answer taken strictly
from the passage. Return ONLY JSON: {{"question": "...", "ground_truth": "..."}}

Passage:
{chunk.page_content}"""
        ).content
        match = re.search(r"\{.*\}", raw, re.S)
        if not match:
            continue
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            continue
        if data.get("question") and data.get("ground_truth"):
            items.append({
                "question": data["question"],
                "ground_truth": data["ground_truth"],
                "source": chunk.metadata.get("source"),
                "page": chunk.metadata.get("page"),
            })
        time.sleep(2)
    return items


def collect_rows(svc, items: list[dict], pause: float = 8) -> list[dict]:
    """Run the real agent on each generated question."""
    rows = []
    for item in items:
        answer_text, contexts = "", []
        for kind, payload in svc.run_agent(item["question"], chat_history=[], selected_documents=None):
            if kind == "result":
                stream, sources = payload
                answer_text = "".join(
                    c if isinstance(c, str) else str(getattr(c, "content", c)) for c in stream
                )
                answer_text, _ = check_output(answer_text, sources)
                if isinstance(sources, dict):
                    contexts = [d.page_content for d in sources.values()]
                elif isinstance(sources, list):
                    for s in sources:
                        if hasattr(s, "page_content"):
                            contexts.append(s.page_content)
                        elif s.metadata.get("page") == "summary":
                            contexts.append(svc.document_summaries.get(s.metadata["source"], ""))
        rows.append({
            "user_input": item["question"],
            "response": answer_text,
            "retrieved_contexts": contexts or ["(no context retrieved)"],
            "reference": item["ground_truth"],
        })
        time.sleep(pause)
    return rows


def score_rows(rows: list[dict]):
    """LLM-as-judge scoring, trying each Groq key in turn."""
    dataset = EvaluationDataset.from_list(rows)
    embeddings = LangchainEmbeddingsWrapper(get_embedding_model())
    last_error = None
    for key in load_groq_keys():
        judge = LangchainLLMWrapper(
            ChatGroq(model=RAGAS_JUDGE_MODEL, temperature=0, max_retries=6, api_key=key)
        )
        try:
            result = evaluate(
                dataset=dataset,
                metrics=[Faithfulness(), AnswerRelevancy(strictness=1), ContextPrecision(), ContextRecall()],
                llm=judge,
                embeddings=embeddings,
                raise_exceptions=True,
                run_config=RunConfig(timeout=600, max_workers=1, max_retries=10, max_wait=60),
            )
            df = result.to_pandas()
            return df.select_dtypes("number").mean().round(3).to_dict(), df.to_dict(orient="records")
        except (groq.RateLimitError, TimeoutError) as e:
             last_error = e
    raise RuntimeError(f"All Groq keys are rate limited: {last_error}")