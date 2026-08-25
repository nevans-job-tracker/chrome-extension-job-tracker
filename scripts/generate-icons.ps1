Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing.Common

function New-RoundedRectanglePath {
    param(
        [float]$X,
        [float]$Y,
        [float]$Width,
        [float]$Height,
        [float]$Radius
    )

    $iconPath = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $diameter = $Radius * 2
    $iconPath.AddArc($X, $Y, $diameter, $diameter, 180, 90)
    $iconPath.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
    $iconPath.AddArc(
        $X + $Width - $diameter,
        $Y + $Height - $diameter,
        $diameter,
        $diameter,
        0,
        90
    )
    $iconPath.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
    $iconPath.CloseFigure()
    return $iconPath
}

$iconOutputDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) "icons"
[System.IO.Directory]::CreateDirectory($iconOutputDirectory) | Out-Null

$masterSize = 512
$masterBitmap = [System.Drawing.Bitmap]::new(
    $masterSize,
    $masterSize,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
)
$masterGraphics = [System.Drawing.Graphics]::FromImage($masterBitmap)

try {
    $masterGraphics.Clear([System.Drawing.Color]::Transparent)
    $masterGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $masterGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $masterGraphics.CompositingQuality =
        [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    $blue = [System.Drawing.ColorTranslator]::FromHtml("#2563EB")
    $white = [System.Drawing.Color]::White
    $blueBrush = [System.Drawing.SolidBrush]::new($blue)
    $whiteBrush = [System.Drawing.SolidBrush]::new($white)

    try {
        $backgroundPath = New-RoundedRectanglePath 24 24 464 464 100
        $handleOuterPath = New-RoundedRectanglePath 184 110 144 126 36
        $handleInnerPath = New-RoundedRectanglePath 222 146 68 90 18
        $casePath = New-RoundedRectanglePath 104 194 304 214 44

        try {
            $masterGraphics.FillPath($blueBrush, $backgroundPath)
            $masterGraphics.FillPath($whiteBrush, $handleOuterPath)
            $masterGraphics.FillPath($blueBrush, $handleInnerPath)
            $masterGraphics.FillPath($whiteBrush, $casePath)

            $plusPen = [System.Drawing.Pen]::new($blue, 42)
            try {
                $plusPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
                $plusPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
                $masterGraphics.DrawLine($plusPen, 256, 248, 256, 354)
                $masterGraphics.DrawLine($plusPen, 203, 301, 309, 301)
            }
            finally {
                $plusPen.Dispose()
            }
        }
        finally {
            $backgroundPath.Dispose()
            $handleOuterPath.Dispose()
            $handleInnerPath.Dispose()
            $casePath.Dispose()
        }
    }
    finally {
        $blueBrush.Dispose()
        $whiteBrush.Dispose()
    }

    foreach ($iconSize in 16, 32, 48, 128) {
        $resizedBitmap = [System.Drawing.Bitmap]::new(
            $iconSize,
            $iconSize,
            [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
        )
        $resizedGraphics = [System.Drawing.Graphics]::FromImage($resizedBitmap)

        try {
            $resizedGraphics.Clear([System.Drawing.Color]::Transparent)
            $resizedGraphics.CompositingMode =
                [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
            $resizedGraphics.CompositingQuality =
                [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $resizedGraphics.InterpolationMode =
                [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $resizedGraphics.SmoothingMode =
                [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $resizedGraphics.PixelOffsetMode =
                [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $resizedGraphics.DrawImage(
                $masterBitmap,
                [System.Drawing.Rectangle]::new(0, 0, $iconSize, $iconSize),
                0,
                0,
                $masterSize,
                $masterSize,
                [System.Drawing.GraphicsUnit]::Pixel
            )

            $iconPath = Join-Path $iconOutputDirectory "icon-$iconSize.png"
            $resizedBitmap.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)
        }
        finally {
            $resizedGraphics.Dispose()
            $resizedBitmap.Dispose()
        }
    }
}
finally {
    $masterGraphics.Dispose()
    $masterBitmap.Dispose()
}
