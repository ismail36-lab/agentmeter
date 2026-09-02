"""
Meterix Python SDK
------------------
Lightweight logging wrapper for Meterix LLM telemetry and cost tracking API.
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
from typing import Dict, Any, Optional


class Meterix:
    """Meterix Python SDK Client"""

    def __init__(
        self,
        api_key: Optional[str] = None,
        endpoint: Optional[str] = None,
    ):
        self.api_key = api_key or os.environ.get("METERIX_API_KEY") or os.environ.get("AGENTMETER_API_KEY") or "mx_test_sk_9918237192"
        env_endpoint = os.environ.get("METERIX_ENDPOINT") or os.environ.get("NEXT_PUBLIC_APP_URL")
        if env_endpoint and not env_endpoint.endswith("/api/v1/telemetry"):
            env_endpoint = f"{env_endpoint.rstrip('/')}/api/v1/telemetry"
        self.endpoint = endpoint or env_endpoint or "http://localhost:3000/api/v1/telemetry"

    def log_usage(
        self,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Sends telemetry usage log to Meterix server.

        :param model: Name of the LLM model (e.g. 'gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet', 'gemini-1.5-pro')
        :param prompt_tokens: Count of prompt tokens used
        :param completion_tokens: Count of completion tokens generated
        :param metadata: Optional dictionary of metadata tags
        :return: JSON response dict from Meterix server
        """
        payload = {
            "model": model,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "metadata": metadata or {},
        }

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "User-Agent": "Meterix-Python-SDK/1.0.0",
        }

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(self.endpoint, data=data, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                res_body = response.read().decode("utf-8")
                return json.loads(res_body)
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            try:
                return json.loads(error_body)
            except Exception:
                return {"error": f"HTTP Error {e.code}: {e.reason}", "details": error_body}
        except urllib.error.URLError as e:
            return {"error": "Connection Failed", "details": str(e.reason)}
        except Exception as e:
            return {"error": "Unexpected Error", "details": str(e)}

    def trace(self, model: str, metadata: Optional[Dict[str, Any]] = None):
        """
        Context manager to measure execution time and log LLM usage.
        """
        return MeterixTrace(self, model=model, metadata=metadata)


class MeterixTrace:
    def __init__(self, client: Meterix, model: str, metadata: Optional[Dict[str, Any]] = None):
        self.client = client
        self.model = model
        self.metadata = metadata or {}
        self.start_time = 0.0

    def __enter__(self):
        self.start_time = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        duration_ms = round((time.time() - self.start_time) * 1000, 2)
        meta = {**self.metadata, "latency_ms": duration_ms}
        if exc_type is not None:
            meta["error"] = str(exc_val)
        # Default fallback estimate if exact tokens were not provided in context
        self.client.log_usage(self.model, prompt_tokens=500, completion_tokens=150, metadata=meta)


# Backward compatibility alias
AgentMeter = Meterix

if __name__ == "__main__":
    print("=== Meterix Python SDK Test ===")
    
    # Initialize client
    meter = Meterix(api_key="mx_test_sk_9918237192", endpoint="http://localhost:3000/api/v1/telemetry")
    
    test_calls = [
        ("gpt-4o", 1250, 480, {"environment": "production", "agent_name": "CustomerSupportAgent"}),
        ("gpt-4o-mini", 3400, 920, {"environment": "production", "agent_name": "ClassifierAgent"}),
        ("claude-3-5-sonnet", 2100, 1150, {"environment": "staging", "agent_name": "CodeReviewAgent"}),
        ("gemini-1.5-pro", 1800, 600, {"environment": "production", "agent_name": "GeminiAgent"}),
    ]

    for model, p_tokens, c_tokens, meta in test_calls:
        print(f"\n[SDK Log Call] Model: {model} | Prompt: {p_tokens} | Completion: {c_tokens}")
        result = meter.log_usage(model=model, prompt_tokens=p_tokens, completion_tokens=c_tokens, metadata=meta)
        print("Response:", json.dumps(result, indent=2))

    print("\n=== Meterix SDK Test Complete ===")
