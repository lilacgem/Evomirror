"""Build with GCC/Clang; Windows Visual Studio projects remain supported."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[1]
build = root / 'build'
build.mkdir(exist_ok=True)
suffix = '.exe' if os.name == 'nt' else ''
def run(*args):
    subprocess.run(args, cwd=root, check=True)
run(os.environ.get('CC', 'gcc'), '-std=c11', '-Wall', '-Wextra', '-c', 'EvoRoot/AU/logic.c', '-o', str(build / 'logic.o'))
run(os.environ.get('CXX', 'g++'), '-std=c++20', '-Wall', '-Wextra', 'EvoRoot/AU/SecondCompiler.cpp', str(build / 'logic.o'), '-o', str(build / ('second-compiler' + suffix)))
run(os.environ.get('CXX', 'g++'), '-std=c++20', '-Wall', '-Wextra', 'EvoRoot/AUEVO_StateCompiler/AUEVO_StateCompiler/main.cpp', 'EvoRoot/AUEVO_StateCompiler/AUEVO_StateCompiler/state_compiler.cpp', '-o', str(build / ('state-compiler' + suffix)))
