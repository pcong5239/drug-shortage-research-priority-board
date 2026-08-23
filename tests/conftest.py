"""Windows compatibility and test instrumentation for GenLayer Test Direct Mode."""

from __future__ import annotations

import json
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Any

import pytest
from gltest.direct.vm import MockedWebResponseData, VMContext

_MESSAGE_FILES: list[Path] = []


def _windows_message_injector(vm) -> None:
    from genlayer.py import calldata
    from genlayer.py.types import Address

    def address(value):
        return Address(value) if isinstance(value, bytes) else value

    message_data = {
        "contract_address": address(vm._contract_address),
        "sender_address": address(vm.sender),
        "origin_address": address(vm.origin),
        "stack": [],
        "value": vm._value,
        "datetime": vm._datetime,
        "is_init": False,
        "chain_id": vm._chain_id,
        "entry_kind": 0,
        "entry_data": b"",
        "entry_stage_data": None,
    }
    fd, raw_path = tempfile.mkstemp(prefix="gltest-direct-")
    path = Path(raw_path)
    _MESSAGE_FILES.append(path)
    os.write(fd, calldata.encode(message_data))
    os.lseek(fd, 0, os.SEEK_SET)
    vm._original_stdin_fd = os.dup(0)
    os.dup2(fd, 0)
    os.close(fd)


def _instrument_web_render() -> None:
    from gltest.direct import wasi_mock

    original_handle_web_render = wasi_mock._handle_web_render

    def _recording_handle_web_render(vm: Any, data: Any) -> Any:
        if not hasattr(vm, "_recorded_web_renders"):
            vm._recorded_web_renders = []
        vm._recorded_web_renders.append(dict(data))
        return original_handle_web_render(vm, data)

    wasi_mock._handle_web_render = _recording_handle_web_render

    original_handle_llm_request = wasi_mock._handle_llm_request

    def _recording_handle_llm_request(vm: Any, data: Any) -> Any:
        if not hasattr(vm, "_recorded_llm_prompts"):
            vm._recorded_llm_prompts = []
        vm._recorded_llm_prompts.append(data.get("prompt", ""))
        return original_handle_llm_request(vm, data)

    wasi_mock._handle_llm_request = _recording_handle_llm_request


def pytest_configure() -> None:
    if sys.platform == "win32":
        from gltest.direct import loader

        loader._inject_message_to_fd0 = _windows_message_injector

    _instrument_web_render()


def pytest_sessionfinish() -> None:
    for path in _MESSAGE_FILES:
        try:
            path.unlink(missing_ok=True)
        except PermissionError:
            pass


class MockWebHelper:
    def __init__(self, vm: VMContext):
        self.vm = vm

    def clear(self):
        self.vm.clear_mocks()

    def get(self, url_pattern: str, status: int = 200, body: bytes | str | None = b""):
        body_bytes = body.encode("utf-8") if isinstance(body, str) else body
        self.vm.mock_web(url_pattern, MockedWebResponseData(method="GET", status=status, body=body_bytes))

    def get_json(self, url_pattern: str, status: int = 200, data: dict | list | None = None):
        body_str = json.dumps(data) if data is not None else ""
        self.vm.mock_web(
            url_pattern,
            MockedWebResponseData(method="GET", status=status, body=body_str.encode("utf-8")),
        )


@pytest.fixture(autouse=True)
def enforce_direct_mode_safety(direct_vm):
    direct_vm.check_pickling = True
    direct_vm.strict_mocks = True
    yield


@pytest.fixture
def mock_web(direct_vm):
    return MockWebHelper(direct_vm)
