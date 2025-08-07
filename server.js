// server.js

// Import các thư viện cần thiết
const express = require('express');
const fetch = require('node-fetch'); // Sử dụng node-fetch để gọi API
const path = require('path');
require('dotenv').config(); // Để đọc biến môi trường từ file .env

// Khởi tạo ứng dụng Express
const app = express();
const PORT = process.env.PORT || 3000; // Render sẽ tự cung cấp PORT

// Middleware để xử lý JSON và phục vụ các tệp tĩnh
app.use(express.json());
app.use(express.static(path.join(__dirname))); // Phục vụ các tệp trong cùng thư mục

// Route chính để phục vụ file index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// (Phiên bản hoàn chỉnh, kết hợp luân chuyển key và ghi log JSON)
app.post('/api/generate-image', async (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
        // Ghi log lỗi nếu không có prompt
        const logData = { level: "warn", message: "Request received without a prompt." };
        console.warn(JSON.stringify(logData));
        return res.status(400).json({ error: 'Prompt is required' });
    }

    // 1. Lấy danh sách API key từ biến môi trường (giống mã nguồn gốc)
    const apiKeysString = process.env.STABILITY_API_KEYS;

    if (!apiKeysString) {
        // Ghi log lỗi và trả về phản hồi nếu không cấu hình key
        const logData = {
            level: "error",
            message: "STABILITY_API_KEYS not found in environment variables. Server is not configured."
        };
        console.error(JSON.stringify(logData));
        return res.status(500).json({ error: 'API keys are not configured on the server.' });
    }

    // Tách chuỗi thành một mảng các key
    const apiKeys = apiKeysString.split(',').map(key => key.trim());

    const engineId = 'stable-diffusion-xl-1024-v1-0';
    const apiHost = 'https://api.stability.ai';

    // 2. Vòng lặp để luân chuyển và thử từng key (giống mã nguồn gốc)
    for (const apiKey of apiKeys) {
        const keyIdentifier = `...${apiKey.slice(-4)}`; // Dùng để nhận diện key trong log
        try {
            console.log(JSON.stringify({ 
                level: "info", 
                message: `Trying API key`,
                key: keyIdentifier
            }));

            const response = await fetch(`${apiHost}/v1/generation/${engineId}/text-to-image`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    text_prompts: [{ text: prompt }],
                    cfg_scale: 7,
                    height: 1024,
                    width: 1024,
                    steps: 30,
                    samples: 1,
                }),
            });

            // 3. Nếu key hợp lệ và yêu cầu thành công (status 200 OK)
            if (response.ok) {
                const logData = { level: "info", message: "Image generation successful", key: keyIdentifier };
                console.log(JSON.stringify(logData));
                
                const responseJSON = await response.json();
                return res.json(responseJSON); // Trả kết quả về cho client và kết thúc
            }

            // 4. Nếu key không hợp lệ hoặc hết tín dụng (401 Unauthorized)
            if (response.status === 401) {
                const logData = {
                    level: "warn",
                    message: "API key failed (Unauthorized/Out of credits). Trying next key.",
                    key: keyIdentifier,
                    statusCode: 401
                };
                console.warn(JSON.stringify(logData));
                continue; // Bỏ qua key này và thử key tiếp theo
            }

            // 5. Đối với các lỗi khác, ghi log chi tiết và thử key tiếp theo
            const errorText = await response.text();
            const logData = {
                level: "error",
                message: "Non-recoverable response from Stability AI with current key.",
                key: keyIdentifier,
                statusCode: response.status,
                details: errorText
            };
            console.error(JSON.stringify(logData));
            // Không `throw` lỗi ở đây để vòng lặp có thể tiếp tục với key khác

        } catch (error) {
            // Bắt các lỗi mạng hoặc lỗi hệ thống
            const logData = {
                level: "error",
                message: "A network or system error occurred while trying an API key.",
                key: keyIdentifier,
                errorDetails: error.message
            };
            console.error(JSON.stringify(logData));
            // Tiếp tục thử key tiếp theo
        }
    }

    // 6. Nếu vòng lặp kết thúc mà không có key nào thành công
    const finalErrorLog = {
        level: "error",
        message: "All available API keys failed. Unable to generate image."
    };
    console.error(JSON.stringify(finalErrorLog));
    res.status(500).json({ error: 'Failed to generate image. All available API keys failed.' });
});

// Khởi động server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
