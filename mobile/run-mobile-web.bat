@echo off
cd /d "%~dp0"
if not exist .env copy .env.example .env
call npm install
call npx expo install expo-linking expo-constants expo-status-bar react-native-web react-dom
call npm run web
