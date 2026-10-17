"""Use the existing private OTLP gateway and ordinary OpenTelemetry SDK."""

import logging
import os
import time

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

resource = Resource.create(
    {
        "service.name": "atlas-data",
        "deployment.environment.name": os.environ.get("DEPLOYMENT_ENVIRONMENT", "local"),
    }
)
traces = TracerProvider(resource=resource)
logs = LoggerProvider(resource=resource)
if os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT"):
    traces.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    logs.add_log_record_processor(BatchLogRecordProcessor(OTLPLogExporter()))
trace.set_tracer_provider(traces)
logger = logging.getLogger("atlas-data")
logger.setLevel(logging.INFO)
logger.addHandler(LoggingHandler(logger_provider=logs))
logger.addHandler(logging.StreamHandler())


def observe(event, operation):
    started = time.monotonic()
    attributes = {
        "project": "atlas",
        "pipeline": "languages",
        "execution_arn": event["run"],
        "stage": event["stage"],
        "loki.attribute.labels": "project,pipeline,stage,event_name,outcome",
    }
    with traces.get_tracer("atlas-data").start_as_current_span(
        f"atlas.data.{event['stage']}", attributes=attributes
    ):
        try:
            result = operation()
            logger.info(
                "Atlas data stage completed",
                extra={
                    **attributes,
                    "event_name": "atlas.data.stage",
                    "outcome": "succeeded",
                    "duration_seconds": time.monotonic() - started,
                },
            )
            return result
        except Exception:
            logger.exception(
                "Atlas data stage failed",
                extra={**attributes, "event_name": "atlas.data.stage", "outcome": "failed"},
            )
            raise
        finally:
            traces.force_flush(timeout_millis=5000)
            logs.force_flush(timeout_millis=5000)
