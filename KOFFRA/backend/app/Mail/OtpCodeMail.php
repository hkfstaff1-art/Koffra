<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/** Email du code de vérification. Envoi synchrone : pas de code stocké dans la file d'attente. */
class OtpCodeMail extends Mailable
{
    use Queueable;

    public function __construct(
        public readonly string $recipientName,
        public readonly string $code,
        public readonly int $ttlMinutes,
        public readonly string $purpose,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'KOFFRA — votre code de vérification');
    }

    public function content(): Content
    {
        return new Content(text: 'mail.otp-code');
    }
}
