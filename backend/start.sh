#!/bin/bash
echo "Starting backend and AI agent..."

# Start backend in background
python -m uvicorn backend.main_final:app --host 0.0.0.0 --port $PORT &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# Start AI agent worker in background
cd backend/my-agent && uv run python src/agent.py dev &
AGENT_PID=$!

echo "Backend PID: $BACKEND_PID"
echo "Agent PID: $AGENT_PID"
echo "Both services started. Press Ctrl+C to stop."

# Wait for both processes
wait $BACKEND_PID $AGENT_PID
