// Uniform success response shape. Errors use a parallel shape via errorHandler middleware.
function successResponse(res, status, message, data) {
   res.status(status).json({
      success: true,
      message,
      data: data ?? null,
   });
}

module.exports = { successResponse };
