<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class InvitationMail extends Mailable
{
    use Queueable;

    public function __construct(
        public readonly string $inviterName,
        public readonly string $acceptUrl,
        public readonly int $ttlHours,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'KOFFRA — invitation à rejoindre le coffre');
    }

    public function content(): Content
    {
        return new Content(text: 'mail.invitation');
    }
}
