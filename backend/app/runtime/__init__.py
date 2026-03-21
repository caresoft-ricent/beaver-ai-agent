"""beaver-ai-agent 2.0 Runtime 层

分层架构:
  A. Session / Scope Runtime  → 复用 session/ + kernel/scope.py
  B. Domain / Ontology Runtime → domain_runtime.py
  C. Context Planner           → context_planner.py
  D. Action / Adapter Runtime  → action_runtime.py + adapters/
  E. Response Runtime          → response_runtime.py
"""
