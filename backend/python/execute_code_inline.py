"""
Inline Python Code Executor
Reads JSON from stdin, executes code, writes JSON to stdout
"""
import sys
import json
import io
from contextlib import redirect_stdout, redirect_stderr

# Safe imports
try:
    import numpy as np
    import pandas as pd
    import scipy
    HAS_SCIPY = True
except ImportError:
    np = None
    pd = None
    scipy = None
    HAS_SCIPY = False

def safe_import(name, *args, **kwargs):
    """Only allow importing numpy, pandas, and scipy"""
    allowed_modules = ['numpy', 'pandas', 'scipy', 'np', 'pd']
    if name in allowed_modules or name.startswith('numpy.') or name.startswith('pandas.') or name.startswith('scipy.'):
        return __import__(name, *args, **kwargs)
    raise ImportError(f"Import of '{name}' is not allowed. Only numpy, pandas, and scipy are permitted.")

# Safe built-ins
SAFE_BUILTINS = {
    'abs': abs,
    'all': all,
    'any': any,
    'bool': bool,
    'dict': dict,
    'enumerate': enumerate,
    'float': float,
    'int': int,
    'len': len,
    'list': list,
    'max': max,
    'min': min,
    'range': range,
    'round': round,
    'sorted': sorted,
    'sum': sum,
    'str': str,
    'zip': zip,
    'print': print,
    '__import__': safe_import,
    'isinstance': isinstance,
    'type': type,
}

# Safe libraries
SAFE_LIBRARIES = {}
if np:
    SAFE_LIBRARIES.update({'np': np, 'numpy': np})
if pd:
    SAFE_LIBRARIES.update({'pd': pd, 'pandas': pd})
if scipy:
    SAFE_LIBRARIES['scipy'] = scipy

def execute_custom_code(code, input_data):
    """Execute user code in restricted environment"""
    # Create restricted globals
    restricted_globals = {
        '__builtins__': SAFE_BUILTINS,
        **SAFE_LIBRARIES,
    }
    
    # Add input data
    restricted_globals['input_data'] = input_data
    restricted_globals['output_data'] = None
    
    # Capture output
    stdout_capture = io.StringIO()
    stderr_capture = io.StringIO()
    
    try:
        with redirect_stdout(stdout_capture), redirect_stderr(stderr_capture):
            exec(code, restricted_globals)
        
        output_data = restricted_globals.get('output_data', input_data)
        
        return {
            'success': True,
            'output_data': output_data,
            'stdout': stdout_capture.getvalue(),
            'stderr': stderr_capture.getvalue(),
            'error': None
        }
    except Exception as e:
        import traceback
        return {
            'success': False,
            'output_data': None,
            'stdout': stdout_capture.getvalue(),
            'stderr': stderr_capture.getvalue(),
            'error': f"{type(e).__name__}: {str(e)}\n{traceback.format_exc()}"
        }

if __name__ == '__main__':
    try:
        # Read input from stdin with proper encoding handling
        # Use surrogateescape to handle any malformed UTF-8
        sys.stdin.reconfigure(encoding='utf-8', errors='surrogateescape')
        sys.stdout.reconfigure(encoding='utf-8', errors='surrogateescape')
        
        input_json = sys.stdin.read()
        data = json.loads(input_json)
        
        code = data.get('code', '')
        input_data = data.get('input_data', [])
        
        # Execute code
        result = execute_custom_code(code, input_data)
        
        # Write result to stdout with proper encoding
        output = json.dumps(result, ensure_ascii=False)
        print(output)
        
    except Exception as e:
        import traceback
        error_result = {
            'success': False,
            'output_data': None,
            'stdout': '',
            'stderr': '',
            'error': f"{str(e)}\n{traceback.format_exc()}"
        }
        print(json.dumps(error_result, ensure_ascii=False))
        sys.exit(1)
