from api.config import _AGENT_DIR
import sys
print("AGENT_DIR:", _AGENT_DIR)
print("SYS.PATH:", sys.path)
try:
    from run_agent import AIAgent
    print("SUCCESS")
except Exception as e:
    import traceback
    traceback.print_exc()
