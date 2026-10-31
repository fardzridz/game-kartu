@echo off
REM Nyalakan FigCraft dengan port kontrol buat MCP live.
REM PENTING: SAVE dulu kerjaan di FigCraft (Ctrl+S) sebelum jalanin file ini,
REM karena script ini menutup paksa semua proses FigCraft.
echo Menutup FigCraft yang lagi jalan...
taskkill /IM figcraft.exe /F >nul 2>&1
timeout /t 2 /nobreak >nul
echo Nyalakan ulang FigCraft dengan --control 7979...
start "" "C:\Users\MyBook Z Series\FigCraft\figcraft.exe" --control 7979
echo Selesai. Buka lagi dokumen lo di FigCraft, terus bilang ke ZCode: "udah".
