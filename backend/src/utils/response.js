// Uniform success response shape. Errors use a parallel shape via errorHandler middleware.
function successResponse(res, status, message, data) {
   res.status(status).json({
      success: true,
      message,
      data: data ?? null,
   });
}

// The pagination block every list endpoint returns. `returned` is the size of this page,
// so the last (short) page reports hasMore: false.
function pageMeta(page, limit, total, returned) {
   return { page, limit, total, hasMore: (page - 1) * limit + returned < total };
}

module.exports = { successResponse, pageMeta };
