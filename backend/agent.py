from typing import TypedDict
from langgraph.graph import StateGraph, START, END

MAX_ATTEMPTS = 2


class AgentState(TypedDict, total=False):
    question: str
    chat_history: str
    query: str
    docs: list
    route: str
    relevant: bool
    attempts: int
    context_choice: str
    target_files: list
    manual_files: list


def build_agent(svc):

    def route(state):
        decision = svc.llm.invoke(
            f"""Decide how to handle this message. Reply with exactly one word:
"retrieve", "recall", or "direct".

Use "recall" when the user is asking about an earlier conversation, a
previous chat, or something they asked before in a different chat session
— NOT about the uploaded document itself.
Use "direct" only for greetings, thanks or small talk that isn't a real question.
Use "retrieve" for anything that asks about the uploaded document's content,
facts or information.
Message: {state['question']}"""
        ).content.strip().lower()
        if decision not in ("retrieve", "direct", "recall"):
            decision = "retrieve"
        return {"route": decision}

    def decide_context(state):
        files = state["target_files"] or svc.document_names
        summaries_text = "\n\n".join(
            f"{name}: {svc.document_summaries.get(name, '')}" for name in files
        )
        decision = svc.llm.invoke(
            f"""A user asked this question about these uploaded document(s):
"{state['question']}"

Summaries of the relevant document(s):
{summaries_text}

Decide: can this question be fully and accurately answered using ONLY
the summaries above, or does it need specific details that are likely
only in the full document text (exact numbers, dates, names, specific facts)?

Reply with exactly one word: "summary_only" or "need_chunks"."""
        ).content.strip().lower()

        if decision not in ("summary_only", "need_chunks"):
            decision = "need_chunks"

        return {"context_choice": decision}

    def select_files(state):
        manual = state.get("manual_files") or []
        if manual:
            valid = [name for name in manual if name in svc.document_names]
            return {"target_files": valid}

        if len(svc.document_names) <= 1:
            return {"target_files": []}

        file_list = "\n".join(f"- {name}" for name in svc.document_names)
        decision = svc.llm.invoke(
            f"""Available documents:
{file_list}

Question: {state['question']}

Which document(s) does this question need? If it needs all documents
(e.g. asks to compare them, or doesn't mention any specific one),
reply with exactly: all
Otherwise reply with a comma-separated list of the exact filenames
from the list above that are relevant. Reply with nothing else."""
        ).content.strip()

        if decision.lower() == "all":
            return {"target_files": []}

        chosen = [name.strip() for name in decision.split(",")]
        valid = [name for name in chosen if name in svc.document_names]
        return {"target_files": valid}

    def condense(state):
        if state["chat_history"] != "None":
            q = svc.condense_chain.invoke({
                "chat_history": state["chat_history"],
                "question": state["question"],
            })
        else:
            q = state["question"]
        return {"query": q.strip()}

    def retrieve(state):
        docs = svc.hybrid_search(state["query"], target_files=state["target_files"])
        return {"docs": docs, "attempts": state["attempts"] + 1}
    def rerank(state):
        reranked_docs = svc.rerank_docs(state["query"], state["docs"])
        return {"docs": reranked_docs}

    def grade(state):
        context = "\n\n".join(doc.page_content for doc in state["docs"])
        decision = svc.llm.invoke(
            f"""question: {state['query']}
retrieved chunks: {context}
do these chunks contain relevant information that helps answer the question?
Reply with exactly one word: "yes" or "no"
"""
        ).content.strip().lower()
        return {"relevant": decision.startswith("yes")}

    def rewrite_query(state):
        new_query = svc.llm.invoke(
            f"""this search query did not find relevant information:
"{state['query']}"
original question: {state['question']}
write a different search query for the same question, using different keywords or phrasing.
reply with only the new query, nothing else
"""
        ).content.strip()
        return {"query": new_query}

    def after_grade(state):
        if state["relevant"]:
            return "done"
        if state["attempts"] >= MAX_ATTEMPTS:
            return "done"
        return "retry"

    graph = StateGraph(AgentState)
    graph.add_node("route", route)
    graph.add_node("condense", condense)
    graph.add_node("retrieve", retrieve)
    graph.add_node("rerank", rerank)
    graph.add_node("grade", grade)
    graph.add_node("rewrite_query", rewrite_query)
    graph.add_node("decide_context", decide_context)
    graph.add_node("select_files", select_files)

    graph.add_edge(START, "route")
    graph.add_conditional_edges(
    "route",
    lambda state: state["route"],
    {"retrieve": "select_files", "direct": END, "recall": END},
)
    graph.add_edge("select_files", "decide_context")
    graph.add_conditional_edges(
        "decide_context",
        lambda state: state["context_choice"],
        {"summary_only": END, "need_chunks": "condense"},
    )
    graph.add_edge("condense", "retrieve")
    graph.add_edge("retrieve", "rerank")
    graph.add_edge("rerank", "grade")
    graph.add_conditional_edges(
        "grade",
        after_grade,
        {"done": END, "retry": "rewrite_query"},
    )
    graph.add_edge("rewrite_query", "retrieve")

    return graph.compile()