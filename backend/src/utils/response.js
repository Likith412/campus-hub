function successResponse(res, status, message, data) {
   res.status(status).json({
      success: true,
      message,
      data: data ?? null,
   });
}

module.exports = { successResponse };
