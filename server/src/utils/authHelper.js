/**
 * Helper функции для авторизации
 * Поддержка initData из headers (X-Init-Data) и query параметров
 */

/**
 * Получить initData из request
 * Проверяет сначала X-Init-Data header, затем query параметр
 */
function getInitData(req) {
    // Пытаемся получить из header (новый способ после рефакторинга)
    const headerInitData = req.headers['x-init-data'];
    if (headerInitData) {
        return headerInitData;
    }

    // Fallback на query параметр (старый способ)
    return req.query.initData || req.body.initData || null;
}

module.exports = {
    getInitData
};
