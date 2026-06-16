@echo off
SET PATH=%PATH%;D:\Program Files\nodejs\
echo "Dang kiem tra Node..."
call node -v
echo "Dang cai dat thu vien..."
call npm install
echo "Dang khoi chay Local Server..."
call npm run dev
pause