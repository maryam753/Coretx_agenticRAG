import pytest
from unittest.mock import MagicMock
from langchain_core.documents import Document

from backend.agent import build_agent


class FakeLLMResponse:
    def __init__(self, text):
        self.content = text


def make_fake_service(llm_answers, retrieved_docs=None, document_names=None):
    svc = MagicMock()

    llm = MagicMock()
    llm.invoke.side_effect = [FakeLLMResponse(text) for text in llm_answers]
    svc.llm = llm

    svc.document_names = document_names or ["resume.pdf"]
    svc.document_summaries = {name: f"Summary of {name}" for name in svc.document_names}

    fake_docs = retrieved_docs if retrieved_docs is not None else [
        Document(page_content="Sample chunk text", metadata={"source": "resume.pdf", "page": 1})
    ]
    svc.retrieve_for_files.return_value = fake_docs

    condense_chain = MagicMock()
    condense_chain.invoke.return_value = "standalone question"
    svc.condense_chain = condense_chain

    return svc


def base_state(**overrides):
    state = {
        "question": "what is this document about?",
        "chat_history": "None",
        "query": "",
        "docs": [],
        "route": "",
        "relevant": False,
        "attempts": 0,
        "context_choice": "",
        "target_files": [],
    }
    state.update(overrides)
    return state


def test_router_sends_small_talk_direct():
    svc = make_fake_service(llm_answers=["direct"])
    agent = build_agent(svc)

    result = agent.invoke(base_state(question="hi, thanks!"))

    assert result["route"] == "direct"
    assert result["docs"] == []
    assert result["query"] == ""


def test_router_sends_real_question_to_retrieve():
    
    svc = make_fake_service(
        llm_answers=[
            "retrieve",       
            "summary_only",   
        ]
    )
    agent = build_agent(svc)

    result = agent.invoke(base_state(question="what is this document about?"))

    assert result["route"] == "retrieve"
    assert result["context_choice"] == "summary_only"


def test_grader_accepts_relevant_chunks():
    svc = make_fake_service(
        llm_answers=[
            "retrieve",       
            "need_chunks",    
            "yes",            
        ]
    )
    agent = build_agent(svc)

    result = agent.invoke(base_state(question="what email is listed?"))

    assert result["relevant"] is True
    assert result["attempts"] == 1
    assert len(result["docs"]) > 0


def test_retry_loop_stops_after_max_attempts():
    svc = make_fake_service(
        llm_answers=[
            "retrieve",        
            "need_chunks",     
            "no",               
            "different query",  
            "no",              
        ]
    )
    agent = build_agent(svc)

    result = agent.invoke(base_state(question="what is this person's blood type?"))

    assert result["relevant"] is False
    assert result["attempts"] == 2


def test_router_defaults_to_retrieve_on_bad_llm_output():
    svc = make_fake_service(
        llm_answers=[
            "maybe idk",       
            "summary_only",    
        ]
    )
    agent = build_agent(svc)

    result = agent.invoke(base_state(question="???"))

    assert result["route"] == "retrieve"


def test_multi_document_select_files_calls_llm():
    
    svc = make_fake_service(
        llm_answers=[
            "retrieve",                   
            "resume.pdf, cv.pdf",         
            "need_chunks",                
            "yes",                        
        ],
        document_names=["resume.pdf", "cv.pdf"],
    )
    agent = build_agent(svc)

    result = agent.invoke(base_state(question="compare these documents"))

    assert result["target_files"] == ["resume.pdf", "cv.pdf"]