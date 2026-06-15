# TD-MCP Server Dockerfile
#
# Build:
#   docker build -t td-mcp-server .
#
# Run (stdio mode):
#   docker run -i --rm --network host td-mcp-server
#
# Run (with explicit host):
#   docker run -i --rm --add-host host.docker.internal:host-gateway \
#     -e TD_API_HOST=host.docker.internal:44444 td-mcp-server

FROM python:3.11-slim

LABEL maintainer="Nous Research"
LABEL description="MCP (Model Context Protocol) server for TouchDesigner"
LABEL version="1.0.0"

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV TD_API_HOST=localhost:44444

# Create app directory
WORKDIR /app

# Copy MCP server files
COPY mcp_server_stdio.py .

# Make the script executable
RUN chmod +x mcp_server_stdio.py

# Test that the module can be imported
RUN python -c "import mcp_server_stdio; print('MCP server module loaded successfully')"

# Set up stdio entrypoint
ENTRYPOINT ["python", "/app/mcp_server_stdio.py"]

# No CMD needed — the entrypoint reads from stdin and writes to stdout
