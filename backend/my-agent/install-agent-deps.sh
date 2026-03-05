#!/bin/bash
# Install LiveKit Agent Dependencies

echo "============================================================"
echo "Installing LiveKit Agent Dependencies"
echo "============================================================"
echo ""

# Check if we're in the right directory
if [ ! -f "src/agent.py" ]; then
    echo "❌ Error: Please run this from backend/my-agent directory"
    echo "   cd backend/my-agent"
    echo "   ./install-agent-deps.sh"
    exit 1
fi

echo "📦 Installing dependencies..."
echo ""

# Install main packages
pip install "livekit-agents[silero,turn-detector]~=1.4"
pip install "livekit-plugins-noise-cancellation~=0.2"
pip install python-dotenv

echo ""
echo "============================================================"
echo "✅ Installation Complete!"
echo "============================================================"
echo ""
echo "🧪 Testing import..."
python -c "from livekit import rtc; print('✅ livekit.rtc imported successfully')"
python -c "from livekit.agents import Agent; print('✅ livekit.agents imported successfully')"

echo ""
echo "============================================================"
echo "🚀 Ready to Run!"
echo "============================================================"
echo ""
echo "To run the agent:"
echo "   python src/agent.py dev"
echo ""
