# TgStyle - Agent Guidelines

## Project Overview

TgStyle is a Telegram Mini App for AI-powered clothing style analysis. The project consists of three main parts:

1. **Client** (TypeScript/Vite) - Web application running in Telegram WebApp
2. **Server** (Node.js/Express) - REST API server with PostgreSQL database
3. **FastVLM Server** (Python/Flask) - AI analysis server using vision-language models

**Key Documentation:**
- [📚 Knowledge Base Index](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_INDEX.md) - Main documentation hub
- [💻 Client Documentation](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_CLIENT.md) - Frontend modules and methods
- [🔧 Server Documentation](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_SERVER.md) - Backend API and database
- [🤖 FastVLM Documentation](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_FASTVLM.md) - AI server details

## Architecture

```
TgStyle/
├── client/                  # TypeScript + Vite frontend
│   ├── src/modules/        # Feature modules (auth, camera, analysis, etc.)
│   ├── src/types/          # TypeScript type definitions
│   └── src/utils/          # Helper functions
├── server/                  # Node.js + Express backend
│   ├── src/api/            # API route handlers
│   ├── src/controllers/    # Business logic
│   └── src/utils/          # Server utilities
├── fastvlm-server/         # Python + Flask AI server
│   ├── server.py           # Main FastVLM server
│   ├── config.py           # Configuration
│   └── prompt/             # AI prompts for analysis
└── dist/                    # Built client files
```

## Code Style & Conventions

### TypeScript/JavaScript (Client & Server)

- **Modules**: Use singleton pattern - export single instance
- **Functions**: Descriptive names, JSDoc comments for public methods
- **Imports**: Always use explicit imports, no wildcards
- **Error Handling**: Always use try-catch, log errors with logger
- **Types**: Strict TypeScript typing, define interfaces in `/types`

**Example:**
```typescript
// Good
import { authManager } from './modules/auth';
import { logger } from './modules/logger';

async function handleLogin(): Promise<AuthResponse> {
  try {
    const response = await authManager.authenticate();
    return response;
  } catch (error) {
    logger.error('Login failed', error);
    throw error;
  }
}

// Bad
import * from './modules/auth';
function handleLogin() {
  return authManager.authenticate(); // No error handling
}
```

### Python (FastVLM Server)

- **Style**: Follow PEP 8
- **Functions**: Type hints for parameters and returns
- **Logging**: Use app.logger for all logging
- **Error Handling**: Try-except with proper error messages

## Critical Files & Their Purpose

### Client Core Modules

| File | Purpose | Documentation |
|------|---------|---------------|
| `client/src/main.ts` | Application entry point, initialization | [Client Docs](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_CLIENT.md#точка-входа---maints) |
| `client/src/modules/auth.ts` | Telegram authentication manager | [Client Docs](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_CLIENT.md#модуль-авторизации---authts) |
| `client/src/modules/api.ts` | HTTP client for API requests | [Client Docs](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_CLIENT.md#api-клиент---apits) |
| `client/src/modules/uiManager.ts` | Main UI coordinator | [Client Docs](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_CLIENT.md#ui-менеджеры) |
| `client/src/modules/logger.ts` | Client-side logging with server sync | [Client Docs](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_CLIENT.md#логирование---loggerts) |

### Server Core Files

| File | Purpose | Documentation |
|------|---------|---------------|
| `server/server.js` | Main HTTPS server, middleware setup | [Server Docs](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_SERVER.md#основной-сервер---serverjs) |
| `server/src/api/auth.js` | Authentication API endpoint | [Server Docs](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_SERVER.md#авторизация---authjs) |
| `server/src/api/analyze.js` | Image analysis API endpoint | [Server Docs](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_SERVER.md#анализ---analyzejs) |
| `server/src/api/wardrobe.js` | Wardrobe management API | [Server Docs](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_SERVER.md#гардероб---wardrobejs) |

### FastVLM Core Files

| File | Purpose | Documentation |
|------|---------|---------------|
| `fastvlm-server/server.py` | Flask AI analysis server | [FastVLM Docs](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_FASTVLM.md#основной-сервер---serverpy) |
| `fastvlm-server/config.py` | Model and server configuration | [FastVLM Docs](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_FASTVLM.md#конфигурация---configpy) |
| `fastvlm-server/background_removal.py` | Background removal using rembg | [FastVLM Docs](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_FASTVLM.md#удаление-фона---background_removalpy) |

## Common Tasks

### Adding a New Client Module

1. Create module in `client/src/modules/`
2. Export singleton instance
3. Add initialization in `uiManager.ts` or `main.ts`
4. Update types in `client/src/types/`
5. Document in knowledge base

**Reference:** [Client Module Structure](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_CLIENT.md#основные-модули)

### Adding a New API Endpoint

1. Create route handler in `server/src/api/`
2. Add validation using `validateTelegramWebAppData`
3. Implement database queries with Prisma
4. Add error handling
5. Register route in `server.js`
6. Document in knowledge base

**Reference:** [Server API Routes](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_SERVER.md#api-маршруты)

### Modifying AI Analysis

1. Update prompts in `fastvlm-server/prompt/`
2. Adjust `FASHION_ANALYSIS_CONFIG` in `config.py`
3. Test with different images
4. Update documentation

**Reference:** [FastVLM Prompts](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_FASTVLM.md#промпты-для-анализа)

### Database Schema Changes

1. Update Prisma schema in `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name description`
3. Update server code to use new fields
4. Update TypeScript types if needed
5. Document changes

**Reference:** [Database Models](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_SERVER.md#база-данных---prisma)

## DO's and DON'Ts

### ✅ DO

- **Always read documentation first** - Check knowledge base before making changes
- **Use existing patterns** - Follow established code structure and conventions
- **Test changes locally** - Build client (`npm run build`) and test in Telegram
- **Log important operations** - Use `logger.info()` for user actions, `logger.error()` for errors
- **Handle errors gracefully** - Never leave unhandled promises or exceptions
- **Update documentation** - Keep knowledge base in sync with code changes
- **Validate user input** - Always validate Telegram initData on server
- **Check file modifications** - Always use Read tool before editing files
- **Use TypeScript types** - Define interfaces and use strict typing

### ❌ DON'T

- **Don't modify files without reading them first** - Always check current state
- **Don't bypass authentication** - All API endpoints must validate initData
- **Don't store sensitive data in localStorage** - Use server-side storage
- **Don't add console.log directly** - Use logger module (automatically captures console)
- **Don't create new patterns** - Use existing module structure and conventions
- **Don't skip error handling** - Always wrap async operations in try-catch
- **Don't hardcode values** - Use constants from `utils/constants.ts` or `config.py`
- **Don't break Telegram WebApp integration** - Test that app still works in Telegram
- **Don't ignore TypeScript errors** - Fix all type errors before committing
- **Don't modify database directly** - Always use Prisma ORM

## Important Patterns

### Client-Side Module Pattern

```typescript
// Always export singleton instance
class MyManager {
  private state = {};
  
  init(): void {
    // Initialization logic
  }
  
  destroy(): void {
    // Cleanup logic
  }
}

export const myManager = new MyManager();
```

### Server-Side API Pattern

```typescript
// Always validate initData
router.post('/endpoint', async (req, res) => {
  const { initData, ...data } = req.body;
  
  try {
    // 1. Validate Telegram data
    const validation = validateTelegramWebAppData(initData);
    if (!validation.isValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid initData'
      });
    }
    
    // 2. Get user from DB
    const user = await getUserByTelegramId(validation.data.user.id);
    
    // 3. Process request
    const result = await processData(user, data);
    
    // 4. Return response
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Endpoint error', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

### Event-Driven Communication

```typescript
// Dispatch events for inter-module communication
window.dispatchEvent(new CustomEvent('photo:captured', {
  detail: { imageData }
}));

// Listen to events
window.addEventListener('photo:captured', (event: CustomEvent) => {
  const { imageData } = event.detail;
  // Handle event
});
```

## Testing & Verification

Before completing any task:

1. **Build client**: `npm run build`
2. **Type check**: `npm run type-check`
3. **Start servers**:
   - Main server: `npm start`
   - FastVLM: `cd fastvlm-server && python start_fastvlm.py`
4. **Test in Telegram**: Open app in Telegram and verify functionality
5. **Check logs**: Review browser console and server logs for errors

## Database Access

All database operations use Prisma ORM:

```typescript
// Create
const user = await prisma.user.create({ data: { ... } });

// Find
const user = await prisma.user.findUnique({ where: { id } });

// Update
const user = await prisma.user.update({ 
  where: { id },
  data: { ... }
});

// Delete
await prisma.user.delete({ where: { id } });

// With relations
const capsule = await prisma.capsule.findUnique({
  where: { id },
  include: {
    items: {
      include: { wardrobeItem: true }
    }
  }
});
```

**Reference:** [Prisma Usage](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_SERVER.md#использование-prisma)

## Security Considerations

1. **Authentication**: All API requests must include valid Telegram initData
2. **Authorization**: Check resource ownership before modification/deletion
3. **Input Validation**: Validate all user inputs on server side
4. **File Uploads**: Validate file types and sizes (multer configuration)
5. **HTTPS Only**: Server must run on HTTPS for Telegram Mini Apps
6. **SQL Injection**: Prisma ORM prevents SQL injection
7. **XSS Prevention**: Sanitize user-generated content before displaying

## Environment Variables

### Required

```env
DOMAIN=your-domain.com              # Server domain
PORT=443                            # Server port
DATABASE_URL=postgresql://...       # PostgreSQL connection
BOT_TOKEN=your_telegram_bot_token   # Telegram bot token
```

### Optional

```env
NODE_ENV=production                 # Environment
FASTVLM_HOST=http://127.0.0.1      # FastVLM server host
FASTVLM_PORT=3001                   # FastVLM server port
LOG_LEVEL=info                      # Logging level
```

**Full list:** [Server Environment](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_SERVER.md#переменные-окружения) | [FastVLM Environment](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_FASTVLM.md#переменные-окружения)

## Troubleshooting

### Common Issues

**Client not updating after changes:**
- Run `npm run build` to rebuild
- Clear browser cache
- Check for TypeScript errors

**Server not starting:**
- Check SSL certificates exist
- Verify DATABASE_URL is correct
- Check port is not in use

**FastVLM errors:**
- Ensure model is downloaded
- Check GPU/CUDA availability
- Verify Python dependencies

**Full troubleshooting guides:**
- [Client Issues](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_CLIENT.md#debugging)
- [Server Issues](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_SERVER.md#troubleshooting)
- [FastVLM Issues](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_FASTVLM.md#troubleshooting)

## AI Analysis Flow

Understanding the complete flow helps when debugging or adding features:

1. **Client**: User captures/uploads photo via `cameraManager.capturePhoto()`
2. **Client**: Image sent to `analysisManager.analyzeImage()`
3. **Client**: API request to server `/api/analyze` with base64 image
4. **Server**: Validates initData, checks user limits
5. **Server**: Forwards image to FastVLM server at `http://127.0.0.1:3001/analyze`
6. **FastVLM**: Performs multi-pass analysis (6 passes)
7. **FastVLM**: Returns structured results
8. **Server**: Optimizes image for storage, saves to history (max 50 items)
9. **Server**: Updates user counters, returns results to client
10. **Client**: Displays results, updates UI, saves to localStorage

**Detailed flow:** [Analysis Module](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_CLIENT.md#анализ-изображений---analysists) | [Analyze API](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_SERVER.md#анализ---analyzejs) | [FastVLM Analyze](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_FASTVLM.md#analyze---анализ-изображения)

## Module Dependencies

Understanding dependencies prevents breaking changes:

```
main.ts
  ├─> auth.ts (authManager)
  ├─> api.ts (api)
  ├─> logger.ts (logger)
  ├─> uiManager.ts
  │     ├─> uiCore.ts
  │     ├─> uiMenu.ts
  │     ├─> uiAnalysis.ts
  │     ├─> uiWardrobe.ts
  │     ├─> uiCapsules.ts
  │     └─> uiModalManager.ts
  ├─> history.ts (historyManager)
  └─> analysis.ts (analysisManager)
        ├─> camera.ts (cameraManager)
        └─> api.ts
```

## Performance Considerations

- **Client**: Images optimized to max 800x800px before localStorage storage
- **Server**: History limited to 50 items per user (auto-cleanup)
- **FastVLM**: GPU memory managed with context manager
- **Database**: Indexes on User.telegramId, all foreign keys
- **API**: Timeouts configured (60s for analysis, 10s for auth)

## Localization

Currently Russian-only. UI text in:
- Client: Hardcoded strings in modules
- Server: Error messages in API responses
- FastVLM: Prompts in `prompt/*.md` files

To add localization:
1. Extract strings to i18n files
2. Use translation function in UI
3. Pass language preference from Telegram user

## Quick Reference Links

- **Project Structure**: [Knowledge Base Index](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_INDEX.md#структура-базы-знаний)
- **Client Modules**: [Client Documentation](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_CLIENT.md#основные-модули)
- **API Endpoints**: [Server Documentation](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_SERVER.md#api-маршруты)
- **Database Models**: [Server Documentation](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_SERVER.md#модели)
- **AI Configuration**: [FastVLM Documentation](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_FASTVLM.md#конфигурация---configpy)
- **Prompts**: [FastVLM Documentation](./KNOWLEDGE_BASE/KNOWLEDGE_BASE_FASTVLM.md#промпты-для-анализа)

## Getting Help

1. **Check Knowledge Base** - Most questions answered in documentation
2. **Search Code** - Use grep/search for similar patterns
3. **Check Logs** - Review server and FastVLM logs for errors
4. **Test Incrementally** - Make small changes and test frequently

---

**Last Updated:** 2025-01-12

**Documentation Version:** 1.0

**Project Version:** 2.0.0
